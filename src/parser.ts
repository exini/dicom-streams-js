import zlib from "zlib";
import { bytesToInt, bytesToUShortBE, groupNumber, indeterminateLength, isDeflated, tagToString, trim } from "./base";
import {ByteParser, ByteReader, ParseResult, ParseStep} from "./byte-parser";
import {
    Element, Elements, FragmentElement, FragmentsElement, ItemDelimitationElement,
    ItemElement, SequenceDelimitationElement, SequenceElement, UnknownElement, ValueElement,
} from "./elements";
import {ElementsBuilder} from "./elements-builder";
import {Lookup} from "./lookup";
import {dicomPreambleLength, isPreamble, readHeader, tryReadHeader} from "./parsing";
import {Tag} from "./tag";
import {UID} from "./uid";
import {Value} from "./value";
import {VR} from "./vr";

// tslint:disable: max-classes-per-file

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
        public readonly fmiEndPos: number) {}
}

class AttributeState {
    constructor(
        public readonly itemIndex: number,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly inflater: Inflater) {}
}

class FragmentsState {
    constructor(
        public readonly fragmentIndex: number,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly inflater: Inflater) {}
}

abstract class DicomParseStep extends ParseStep {
    constructor(public readonly state: any) {
        super();
    }
}

class AtBeginning extends DicomParseStep {
    constructor() {
        super(null);
    }

    public parse(reader: ByteReader): ParseResult {
        if (reader.remainingSize() < dicomPreambleLength + 8) {
            if (reader.remainingData().slice(0, 128).every((b) => b === 0)) {
                reader.ensure(dicomPreambleLength + 8);
            }
        } else if (isPreamble(reader.remainingData())) {
            reader.take(dicomPreambleLength);
        }
        reader.ensure(8);
        const info = tryReadHeader(reader.remainingData());
        if (info) {
            const nextState = info.hasFmi ?
                new InFmiAttribute(
                    new FmiAttributeState(undefined, info.bigEndian, info.explicitVR, info.hasFmi, 0, undefined)) :
                new InAttribute(new AttributeState(0, info.bigEndian, info.explicitVR, undefined));
            return new ParseResult(undefined, nextState);
        } else {
            throw new Error("Not a DICOM file");
        }
    }

    public onTruncation(reader: ByteReader): void {
        if (reader.remainingSize() !== dicomPreambleLength || !isPreamble(reader.remainingData())) {
            super.onTruncation(reader);
        }
    }
}
const atBeginning = new AtBeginning();

class InFmiAttribute extends DicomParseStep {
    constructor(state: FmiAttributeState) {
        super(state);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        if (groupNumber(header.tag) !== 2) {
            console.warn("Missing or wrong File Meta Information Group Length (0002,0000)");
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
                this.state.fmiEndPos && this.state.fmiEndPos <= this.state.pos ? this.toDatasetStep(reader) : this);
    }

    private toDatasetStep(reader: ByteReader): InAttribute {
        let tsuid = this.state.tsuid;
        if (!tsuid) {
            console.warn("Missing Transfer Syntax (0002,0010) - assume Explicit VR Little Endian");
            tsuid = UID.ExplicitVRLittleEndian;
        }

        const bigEndian = tsuid === UID.ExplicitVRBigEndianRetired;
        const explicitVR = tsuid !== UID.ImplicitVRLittleEndian;

        let inflater: Inflater;

        if (isDeflated(tsuid)) {
            reader.ensure(2);

            inflater = new class extends Inflater {
                public inflate(bytes: Buffer): Buffer {
                    return zlib.inflateRawSync(bytes);
                }
            }();

            const firstTwoBytes = reader.remainingData().slice(0, 2);
            const hasZLIBHeader = bytesToUShortBE(firstTwoBytes) === 0x789C;

            if (hasZLIBHeader) {
                console.warn("Deflated DICOM Stream with ZLIB Header");
                inflater = new class extends Inflater {
                    public inflate(bytes: Buffer): Buffer {
                        return zlib.inflateSync(bytes);
                    }
                }();
            }

            reader.setInput(inflater.inflate(reader.remainingData()));
        }
        return new InAttribute(new AttributeState(0, bigEndian, explicitVR, inflater));
    }
}

class InAttribute extends DicomParseStep {
    constructor(state: AttributeState) {
        super(state);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        reader.take(header.headerLength);
        if (header.vr) {
            if (header.vr === VR.SQ || header.vr === VR.UN && header.valueLength === indeterminateLength) {
                return new ParseResult(
                    new SequenceElement(header.tag, header.valueLength, this.state.bigEndian, this.state.explicitVR),
                    new InAttribute(
                        new AttributeState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater)));
            }
            if (header.valueLength === indeterminateLength) {
                return new ParseResult(
                    new FragmentsElement(header.tag, header.vr, this.state.bigEndian, this.state.explicitVR),
                    new InFragments(
                        new FragmentsState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater)));
            }
            return new ParseResult(
                new ValueElement(header.tag, header.vr, new Value(reader.take(header.valueLength)),
                    this.state.bigEndian, this.state.explicitVR),
                this);
        }
        switch (header.tag) {
            case 0xFFFEE000:
                return new ParseResult(
                    new ItemElement(this.state.itemIndex + 1, header.valueLength, this.state.bigEndian),
                    new InAttribute(new AttributeState(this.state.itemIndex + 1, this.state.bigEndian,
                        this.state.explicitVR, this.state.inflater)));
            case 0xFFFEE00D:
                    return new ParseResult(
                        new ItemDelimitationElement(this.state.itemIndex, this.state.bigEndian),
                        new InAttribute(new AttributeState(this.state.itemIndex, this.state.bigEndian,
                            this.state.explicitVR, this.state.inflater)));
            case 0xFFFEE0DD:
                    return new ParseResult(
                        new SequenceDelimitationElement(this.state.bigEndian),
                        new InAttribute(new AttributeState(this.state.itemIndex, this.state.bigEndian,
                            this.state.explicitVR, this.state.inflater)));
        }
        return new ParseResult(new UnknownElement(this.state.bigEndian), this);
    }
}

class InFragments extends DicomParseStep {
    constructor(state: FragmentsState) {
        super(state);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        reader.take(header.headerLength);
        if (header.tag === 0xFFFEE000) { // begin fragment
            const valueBytes = reader.take(header.valueLength);
            return new ParseResult(
                new FragmentElement(this.state.fragmentIndex + 1, header.valueLength,
                    new Value(valueBytes), this.state.bigEndian),
                new InFragments(new FragmentsState(this.state.fragmentIndex + 1, this.state.bigEndian,
                    this.state.explicitVR, this.state.inflater)));
        }
        if (header.tag === 0xFFFEE0DD) { // end fragments
            if (header.valueLength !== 0) {
                console.warn("Unexpected fragments delimitation length " + header.valueLength);
            }
            return new ParseResult(
                new SequenceDelimitationElement(this.state.bigEndian),
                new InAttribute(
                    new AttributeState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater)));
        }
        reader.take(header.valueLength);
        console.warn("Unexpected element (" + tagToString(header.tag) + ") in fragments with length " +
            header.valueLength);
        return new ParseResult(new UnknownElement(this.state.bigEndian), this);
    }
}

export class Parser {

    private builder = new ElementsBuilder();
    private byteParser: ByteParser = new ByteParser(this);

    constructor(public readonly stop?: (e: Element, depth: number) => boolean) {
        this.byteParser.startWith(atBeginning);
    }

    /**
     * Parse the input binary data, producing DICOM elements that are added to the internal builder. An elements
     * structure can be fetched based on the builder at any time.
     */
    public parse(chunk: Buffer): void {
        const step: DicomParseStep = this.byteParser.current instanceof DicomParseStep ?
            this.byteParser.current as DicomParseStep : undefined;
        if (step && step.state && step.state.inflater) {
            chunk = step.state.inflater.inflate(chunk);
        }
        this.byteParser.parse(chunk);
    }

    /**
     * Called by byte parser to support early stopping. If stop function is supplied and it returns true for
     * the given element, parsing will stop. Element will not be added to builder.
     */
    public shouldStop(element: Element): boolean {
        return this.stop && element && this.stop(element, this.builder.currentDepth());
    }

    /**
     * Called by byte parser when it is emitting the next parsed element.
     */
    public next(element: Element) {
        this.builder.addElement(element);
    }

    /**
     * Get the current elements as represented by the builder
     */
    public result(): Elements {
        return this.builder.result();
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
