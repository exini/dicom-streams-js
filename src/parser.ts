import zlib from 'zlib';
import { bytesToInt, bytesToUShortBE, groupNumber, indeterminateLength, isDeflated, tagToString, trim } from './base';
import { ByteParser, ByteReader, finishedParser, ParseResult, ParseStep } from './byte-parser';
import {
    Element,
    FragmentElement,
    FragmentsElement,
    ItemDelimitationElement,
    ItemElement,
    SequenceDelimitationElement,
    SequenceElement,
    UnknownElement,
    ValueElement,
} from './dicom-elements';
import { ElementsBuilder } from './elements-builder';
import { Lookup } from './lookup';
import { AttributeInfo, dicomPreambleLength, isPreamble, readHeader, tryReadHeader } from './parsing';
import { Tag } from './tag';
import { UID } from './uid';
import { Value } from './value';
import { VR } from './vr';
import { Elements } from './elements';

class Inflater {
    public inflate(bytes: Buffer): Buffer {
        return bytes;
    }
}

class FmiAttributeState {
    constructor(
        public readonly tsuid: string,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly hasFmi: boolean,
        public readonly pos: number,
        public readonly fmiEndPos: number,
    ) {}
}

class AttributeState {
    constructor(
        public readonly itemIndex: number,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly inflater: Inflater,
    ) {}
}

class FragmentsState {
    constructor(
        public readonly fragmentIndex: number,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly inflater: Inflater,
    ) {}
}

abstract class DicomParseStep extends ParseStep {
    constructor(public readonly state: any, public readonly stop: (attributeInfo: AttributeInfo) => boolean) {
        super();
    }
}

class AtBeginning extends DicomParseStep {
    constructor(stop: (attributeInfo: AttributeInfo) => boolean) {
        super(null, stop);
    }

    public parse(reader: ByteReader): ParseResult {
        if (reader.remainingSize() < dicomPreambleLength + 8) {
            if (
                reader
                    .remainingData()
                    .slice(0, 128)
                    .every((b) => b === 0)
            ) {
                reader.ensure(dicomPreambleLength + 8);
            }
        } else if (isPreamble(reader.remainingData())) {
            reader.take(dicomPreambleLength);
        }
        reader.ensure(8);
        const info = tryReadHeader(reader.remainingData());
        if (info) {
            const nextState = info.hasFmi
                ? new InFmiAttribute(
                      new FmiAttributeState(undefined, info.bigEndian, info.explicitVR, info.hasFmi, 0, undefined),
                      this.stop,
                  )
                : new InAttribute(new AttributeState(0, info.bigEndian, info.explicitVR, undefined), this.stop);
            return new ParseResult(undefined, nextState);
        } else {
            throw new Error('Not a DICOM file');
        }
    }

    public onTruncation(reader: ByteReader): void {
        if (reader.remainingSize() !== dicomPreambleLength || !isPreamble(reader.remainingData())) {
            super.onTruncation(reader);
        }
    }
}

class InFmiAttribute extends DicomParseStep {
    constructor(state: FmiAttributeState, stop: (attributeInfo: AttributeInfo) => boolean) {
        super(state, stop);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        if (this.stop(header)) {
            return new ParseResult(undefined, finishedParser);
        }
        if (groupNumber(header.tag) !== 2) {
            console.warn('Missing or wrong File Meta Information Group Length (0002,0000)');
            return new ParseResult(undefined, this.toDatasetStep(reader));
        }
        const updatedVr = header.vr === VR.UN ? Lookup.vrOf(header.tag) : header.vr;
        const bytes = reader.take(header.headerLength + header.valueLength);
        const valueBytes = bytes.slice(header.headerLength);
        this.state.pos += header.headerLength + header.valueLength;
        if (header.tag === Tag.FileMetaInformationGroupLength) {
            this.state.fmiEndPos = this.state.pos + bytesToInt(valueBytes, this.state.bigEndian);
        } else if (header.tag === Tag.TransferSyntaxUID) {
            this.state.tsuid = trim(valueBytes.toString());
        }
        return new ParseResult(
            new ValueElement(header.tag, updatedVr, new Value(valueBytes), this.state.bigEndian, this.state.explicitVR),
            this.state.fmiEndPos && this.state.fmiEndPos <= this.state.pos ? this.toDatasetStep(reader) : this,
        );
    }

    private toDatasetStep(reader: ByteReader): InAttribute {
        let tsuid = this.state.tsuid;
        if (!tsuid) {
            console.warn('Missing Transfer Syntax (0002,0010) - assume Explicit VR Little Endian');
            tsuid = UID.ExplicitVRLittleEndian;
        }

        const bigEndian = tsuid === UID.ExplicitVRBigEndianRetired;
        const explicitVR = tsuid !== UID.ImplicitVRLittleEndian;

        let inflater: Inflater;

        if (isDeflated(tsuid)) {
            reader.ensure(2);

            inflater = new (class extends Inflater {
                public inflate(bytes: Buffer): Buffer {
                    return zlib.inflateRawSync(bytes);
                }
            })();

            const firstTwoBytes = reader.remainingData().slice(0, 2);
            const hasZLIBHeader = bytesToUShortBE(firstTwoBytes) === 0x789c;

            if (hasZLIBHeader) {
                console.warn('Deflated DICOM Stream with ZLIB Header');
                inflater = new (class extends Inflater {
                    public inflate(bytes: Buffer): Buffer {
                        return zlib.inflateSync(bytes);
                    }
                })();
            }

            reader.setInput(inflater.inflate(reader.remainingData()));
        }
        return new InAttribute(new AttributeState(0, bigEndian, explicitVR, inflater), this.stop);
    }
}

class InAttribute extends DicomParseStep {
    constructor(state: AttributeState, stop: (attributeInfo: AttributeInfo) => boolean) {
        super(state, stop);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        reader.take(header.headerLength);
        if (header.vr) {
            if (this.stop(header)) {
                return new ParseResult(undefined, finishedParser);
            }
            if (header.vr === VR.SQ || (header.vr === VR.UN && header.valueLength === indeterminateLength)) {
                return new ParseResult(
                    new SequenceElement(header.tag, header.valueLength, this.state.bigEndian, this.state.explicitVR),
                    new InAttribute(
                        new AttributeState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater),
                        this.stop,
                    ),
                );
            }
            if (header.valueLength === indeterminateLength) {
                return new ParseResult(
                    new FragmentsElement(header.tag, header.vr, this.state.bigEndian, this.state.explicitVR),
                    new InFragments(
                        new FragmentsState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater),
                        this.stop,
                    ),
                );
            }
            return new ParseResult(
                new ValueElement(
                    header.tag,
                    header.vr,
                    new Value(reader.take(header.valueLength)),
                    this.state.bigEndian,
                    this.state.explicitVR,
                ),
                this,
            );
        }
        switch (header.tag) {
            case 0xfffee000:
                return new ParseResult(
                    new ItemElement(this.state.itemIndex + 1, header.valueLength, this.state.bigEndian),
                    new InAttribute(
                        new AttributeState(
                            this.state.itemIndex + 1,
                            this.state.bigEndian,
                            this.state.explicitVR,
                            this.state.inflater,
                        ),
                        this.stop,
                    ),
                );
            case 0xfffee00d:
                return new ParseResult(
                    new ItemDelimitationElement(this.state.itemIndex, this.state.bigEndian),
                    new InAttribute(
                        new AttributeState(
                            this.state.itemIndex,
                            this.state.bigEndian,
                            this.state.explicitVR,
                            this.state.inflater,
                        ),
                        this.stop,
                    ),
                );
            case 0xfffee0dd:
                return new ParseResult(
                    new SequenceDelimitationElement(this.state.bigEndian),
                    new InAttribute(
                        new AttributeState(
                            this.state.itemIndex,
                            this.state.bigEndian,
                            this.state.explicitVR,
                            this.state.inflater,
                        ),
                        this.stop,
                    ),
                );
        }
        return new ParseResult(new UnknownElement(this.state.bigEndian), this);
    }
}

class InFragments extends DicomParseStep {
    constructor(state: FragmentsState, stop: (attributeInfo: AttributeInfo) => boolean) {
        super(state, stop);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        reader.take(header.headerLength);
        if (header.tag === 0xfffee000) {
            // begin fragment
            const valueBytes = reader.take(header.valueLength);
            return new ParseResult(
                new FragmentElement(
                    this.state.fragmentIndex + 1,
                    header.valueLength,
                    new Value(valueBytes),
                    this.state.bigEndian,
                ),
                new InFragments(
                    new FragmentsState(
                        this.state.fragmentIndex + 1,
                        this.state.bigEndian,
                        this.state.explicitVR,
                        this.state.inflater,
                    ),
                    this.stop,
                ),
            );
        }
        if (header.tag === 0xfffee0dd) {
            // end fragments
            if (header.valueLength !== 0) {
                console.warn('Unexpected fragments delimitation length ' + header.valueLength);
            }
            return new ParseResult(
                new SequenceDelimitationElement(this.state.bigEndian),
                new InAttribute(
                    new AttributeState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater),
                    this.stop,
                ),
            );
        }
        reader.take(header.valueLength);
        console.warn(
            'Unexpected element (' + tagToString(header.tag) + ') in fragments with length ' + header.valueLength,
        );
        return new ParseResult(new UnknownElement(this.state.bigEndian), this);
    }
}

export class Parser {
    private builder = new ElementsBuilder();
    private byteParser: ByteParser = new ByteParser(this);

    constructor(public readonly stop?: (attributeInfo: AttributeInfo, depth: number) => boolean) {
        const shouldStop = stop
            ? (attributeInfo: AttributeInfo): boolean => stop(attributeInfo, this.builder.currentDepth())
            : (): boolean => false;
        this.byteParser.startWith(new AtBeginning(shouldStop));
    }

    /**
     * Parse the input binary data, producing DICOM elements that are added to the internal builder. An elements
     * structure can be fetched based on the builder at any time.
     */
    public parse(chunk: Buffer): void {
        const step: DicomParseStep =
            this.byteParser.current instanceof DicomParseStep ? (this.byteParser.current as DicomParseStep) : undefined;
        if (step && step.state && step.state.inflater) {
            chunk = step.state.inflater.inflate(chunk);
        }
        this.byteParser.parse(chunk);
    }

    /**
     * Called by byte parser when it is emitting the next parsed element.
     */
    public next(element: Element): void {
        this.builder.addElement(element);
    }

    /**
     * Get the current elements as represented by the builder
     */
    public result(): Elements {
        return this.builder.build();
    }

    /**
     * Returns true the parser has completed parsing (stop condition was met)
     */
    public isComplete(): boolean {
        return this.byteParser.isCompleted;
    }

    /**
     * Called by byte parser when completing parser. Nothing to do here.
     */
    public complete(): void {
        // do nothing
    }

    /**
     * Called by byte parser on error. Here we just throw the error.
     */
    public fail(error: any): void {
        throw error;
    }
}
