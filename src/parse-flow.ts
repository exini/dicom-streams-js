import { Transform } from "stream";
import zlib from "zlib";
import { bytesToInt, bytesToUShortBE, groupNumber, indeterminateLength, isDeflated, tagToString, trim } from "./base";
import {ByteParser, ByteReader, finishedParser, ParseResult, ParseStep} from "./byte-parser";
import { Detour } from "./detour";
import {Lookup} from "./lookup";
import {dicomPreambleLength, isPreamble, readHeader, tryReadHeader} from "./parsing";
import {
    DeflatedChunk, DicomPart, FragmentsPart, HeaderPart, ItemDelimitationPart, ItemPart,
    PreamblePart, SequenceDelimitationPart, SequencePart, UnknownPart, ValueChunk} from "./parts";
import {Tag} from "./tag";
import {UID} from "./uid";
import {VR} from "./vr";

// tslint:disable: max-classes-per-file

abstract class DicomParseStep extends ParseStep {
    constructor(public readonly state: any, public readonly flow: ParseFlow) {
        super();
    }
}

class DatasetHeaderState {
    constructor(
        public readonly itemIndex: number, public readonly bigEndian: boolean, public readonly explicitVR: boolean) {}
}

class FmiHeaderState {
    constructor(
        public readonly tsuid: string, public readonly bigEndian: boolean, public readonly explicitVR: boolean,
        public readonly hasFmi: boolean, public readonly pos: number, public readonly fmiEndPos: number) {}
}

class ValueState {
    constructor(
        public readonly bigEndian: boolean, public readonly bytesLeft: number, public readonly nextStep: ParseStep) {}
}

class FragmentsState {
    constructor(
        public readonly fragmentIndex: number,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean) {}
}

class AtBeginning extends DicomParseStep {
    constructor(flow: ParseFlow) {
        super(null, flow);
    }

    public parse(reader: ByteReader): ParseResult {
        let maybePreamble;
        if (reader.remainingSize() < dicomPreambleLength + 8) {
            if (reader.remainingData().slice(0, 128).every((b) => b === 0)) {
                reader.ensure(dicomPreambleLength + 8);
            }
        } else if (isPreamble(reader.remainingData())) {
            maybePreamble = new PreamblePart(reader.take(dicomPreambleLength));
        }
        reader.ensure(8);
        const info = tryReadHeader(reader.remainingData());
        if (info) {
            const nextState = info.hasFmi ?
                new InFmiHeader(
                    new FmiHeaderState(undefined, info.bigEndian, info.explicitVR, info.hasFmi, 0, undefined),
                    this.flow) :
                new InDatasetHeader(new DatasetHeaderState(0, info.bigEndian, info.explicitVR), this.flow);
            return new ParseResult(maybePreamble, nextState);
        } else {
            throw new Error("Not a DICOM stream");
        }
    }

    public onTruncation(reader: ByteReader): void {
        if (reader.remainingSize() === dicomPreambleLength && isPreamble(reader.remainingData())) {
            this.flow.push(new PreamblePart(reader.take(dicomPreambleLength)));
        } else {
            super.onTruncation(reader);
        }
    }
}

class InFmiHeader extends DicomParseStep {

    private transferSyntaxLengthLimit = 1024;

    constructor(state: any, flow: ParseFlow) {
        super(state, flow);
    }

    public toDatasetStep(reader: ByteReader, valueLength: number) {
        let tsuid = this.state.tsuid;
        if (!tsuid) {
            console.warn("Missing Transfer Syntax (0002,0010) - assume Explicit VR Little Endian");
            tsuid = UID.ExplicitVRLittleEndian;
        }

        const bigEndian = tsuid === UID.ExplicitVRBigEndianRetired;
        const explicitVR = tsuid !== UID.ImplicitVRLittleEndian;

        if (isDeflated(tsuid)) {
            if (this.flow.inflate) {
                reader.ensure(valueLength + 2);

                let inflater = zlib.createInflateRaw();

                const firstTwoBytes = reader.remainingData().slice(valueLength, valueLength + 2);
                const hasZLIBHeader = bytesToUShortBE(firstTwoBytes) === 0x789C;

                if (hasZLIBHeader) {
                    console.warn("Deflated DICOM Stream with ZLIB Header");
                    inflater = zlib.createInflate();
                }

                const valueBytes = reader.take(valueLength);
                const remainingBytes = reader.remainingData();

                reader.setInput(valueBytes);
                this.flow.setDetourFlow(inflater as unknown as Transform);
                this.flow.setDetour(true, remainingBytes);
            } else {
                return new InDeflatedData(this.state, this.flow);
            }
        }
        return new InDatasetHeader(new DatasetHeaderState(0, bigEndian, explicitVR), this.flow);
    }

    public parse(reader: ByteReader) {
        const header = readHeader(reader, this.state);
        if (groupNumber(header.tag) !== 2) {
            console.warn("Missing or wrong File Meta Information Group Length (0002,0000)");
            return new ParseResult(undefined, this.toDatasetStep(reader, header.valueLength));
        }
        const updatedVr = header.vr === VR.UN ? Lookup.vrOf(header.tag) : header.vr;
        const bytes = reader.take(header.headerLength);
        this.state.pos += header.headerLength + header.valueLength;
        if (header.tag === Tag.FileMetaInformationGroupLength) {
            reader.ensure(4);
            const valueBytes = reader.remainingData().slice(0, 4);
            this.state.fmiEndPos = this.state.pos + bytesToInt(valueBytes, this.state.bigEndian);
        } else if (header.tag === Tag.TransferSyntaxUID) {
            if (header.valueLength < this.transferSyntaxLengthLimit) {
                reader.ensure(header.valueLength);
                const valueBytes = reader.remainingData().slice(0, header.valueLength);
                this.state.tsuid = trim(valueBytes.toString());
            } else {
                console.warn("Transfer syntax data is very large, skipping");
            }
        }
        const part = new HeaderPart(
            header.tag, updatedVr, header.valueLength, true, this.state.bigEndian, this.state.explicitVR, bytes);
        let nextStep: ParseStep = new InFmiHeader(this.state, this.flow);
        if (this.state.fmiEndPos && this.state.fmiEndPos <= this.state.pos) {
            nextStep = this.toDatasetStep(reader, header.valueLength);
        }
        return new ParseResult(
            part,
            new InValue(new ValueState(this.state.bigEndian, header.valueLength, nextStep), this.flow));
    }
}

class InDatasetHeader extends DicomParseStep {
    constructor(state: any, flow: ParseFlow) {
        super(state, flow);
    }

    public readDatasetHeader(reader: ByteReader): DicomPart {
        const header = readHeader(reader, this.state);
        if (header.vr) {
            const bytes = reader.take(header.headerLength);
            if (header.vr === VR.SQ || header.vr === VR.UN && header.valueLength === indeterminateLength) {
                return new SequencePart(
                    header.tag, header.valueLength, this.state.bigEndian, this.state.explicitVR, bytes);
            }
            if (header.valueLength === indeterminateLength) {
                return new FragmentsPart(
                    header.tag, header.valueLength, header.vr, this.state.bigEndian, this.state.explicitVR, bytes);
            }
            return new HeaderPart(
                header.tag, header.vr, header.valueLength, false, this.state.bigEndian, this.state.explicitVR, bytes);
        }
        switch (header.tag) {
            case 0xFFFEE000:
                return new ItemPart(this.state.itemIndex + 1, header.valueLength, this.state.bigEndian, reader.take(8));
            case 0xFFFEE00D:
                return new ItemDelimitationPart(this.state.itemIndex, this.state.bigEndian, reader.take(8));
            case 0xFFFEE0DD:
                return new SequenceDelimitationPart(this.state.bigEndian, reader.take(8));
        }
        return new UnknownPart(this.state.bigEndian, reader.take(header.headerLength));
    }

    public parse(reader: ByteReader) {
        const part = this.readDatasetHeader(reader);
        let nextState = finishedParser;
        if (part) {
            if (part instanceof HeaderPart) {
                if (part.length > 0) {
                    nextState = new InValue(
                        new ValueState(part.bigEndian, part.length,
                            new InDatasetHeader(this.state, this.flow)), this.flow);
                } else {
                    nextState = new InDatasetHeader(this.state, this.flow);
                }
            } else if (part instanceof FragmentsPart) {
                nextState = new InFragments(
                    new FragmentsState(0, part.bigEndian, this.state.explicitVR), this.flow);
            } else if (part instanceof SequencePart) {
                nextState = new InDatasetHeader(
                    new DatasetHeaderState(0, this.state.bigEndian, this.state.explicitVR), this.flow);
            } else if (part instanceof ItemPart) {
                nextState = new InDatasetHeader(
                    new DatasetHeaderState(part.index, this.state.bigEndian, this.state.explicitVR), this.flow);
            } else if (part instanceof ItemDelimitationPart) {
                nextState = new InDatasetHeader(
                    new DatasetHeaderState(part.index, this.state.bigEndian, this.state.explicitVR), this.flow);
            } else if (part instanceof SequenceDelimitationPart) {
                nextState = new InDatasetHeader(
                    new DatasetHeaderState(0, this.state.bigEndian, this.state.explicitVR), this.flow);
            } else {
                nextState = new InDatasetHeader(this.state, this.flow);
            }
        }
        return new ParseResult(part, nextState);
    }
}

class InValue extends DicomParseStep {
    constructor(state: any, flow: ParseFlow) {
        super(state, flow);
    }

    public parse(reader: ByteReader): ParseResult {
        return this.state.bytesLeft <= this.flow.chunkSize ?
            new ParseResult(
                new ValueChunk(this.state.bigEndian, reader.take(this.state.bytesLeft), true), this.state.nextStep) :
            new ParseResult(
                new ValueChunk(this.state.bigEndian, reader.take(this.flow.chunkSize), false),
                new InValue(
                    new ValueState(
                        this.state.bigEndian,
                        this.state.bytesLeft - this.flow.chunkSize,
                        this.state.nextStep),
                        this.flow));
    }
}

class InFragments extends DicomParseStep {
    constructor(state: any, flow: ParseFlow) {
        super(state, flow);
    }

    public parse(reader: ByteReader): ParseResult {
        const header = readHeader(reader, this.state);
        if (header.tag === 0xFFFEE000) { // begin fragment
            const nextState = header.valueLength > 0 ?
                new InValue(
                    new ValueState(this.state.bigEndian, header.valueLength,
                        new InFragments(
                            new FragmentsState(
                                this.state.fragmentIndex + 1,
                                this.state.bigEndian,
                                this.state.explicitVR),
                                this.flow)), this.flow) :
                new InFragments(
                    new FragmentsState(
                        this.state.fragmentIndex + 1,
                        this.state.bigEndian,
                        this.state.explicitVR),
                        this.flow);
            return new ParseResult(
                new ItemPart(
                    this.state.fragmentIndex + 1,
                    header.valueLength,
                    this.state.bigEndian,
                    reader.take(header.headerLength)), nextState);
        }
        if (header.tag === 0xFFFEE0DD) { // end fragments
            if (header.valueLength !== 0) {
                console.warn("Unexpected fragments delimitation length " + header.valueLength);
            }
            return new ParseResult(
                new SequenceDelimitationPart(
                    this.state.bigEndian,
                    reader.take(header.headerLength)),
                    new InDatasetHeader(
                        new DatasetHeaderState(0, this.state.bigEndian, this.state.explicitVR), this.flow));
        }
        console.warn("Unexpected element (" + tagToString(header.tag) +
            ") in fragments with length " + header.valueLength);
        return new ParseResult(
            new UnknownPart(this.state.bigEndian, reader.take(header.headerLength + header.valueLength)), this);
    }
}

class InDeflatedData extends DicomParseStep {
    constructor(state: any, flow: ParseFlow) {
        super(state, flow);
    }

    public parse(reader: ByteReader): ParseResult {
        return new ParseResult(new DeflatedChunk(
            this.state.bigEndian,
            reader.take(Math.min(this.flow.chunkSize, reader.remainingSize()))), this);
    }
}

class ParseFlow extends Detour {

    public parser: ByteParser;

    constructor(
        public readonly chunkSize = 1024 * 1024,
        public readonly inflate = true,
        public readonly bufferBytes = 1024 * 1024) {
        super({highWaterMark: bufferBytes, readableObjectMode: true}); // FIXME should be writableHighWaterMark

        this.parser = new ByteParser(this);
        this.parser.startWith(new AtBeginning(this));
    }

    /**
     * Overrides process in Detour. Process a chunk of binary data.
     */
    public process(chunk: any): void {
        this.parser.parse(chunk);
    }

    /**
     * Overrides cleanup in Detour. If there are unparsed bytes left, try to parse these, or fail.
     */
    public cleanup(): void {
        this.parser.flush();
    }

    /**
     * Called by byte parser when it is emitting the next parsed element
     */
    public next(part: any): void {
        this.push(part);
    }

    /**
     * Called by byte parser to support early stopping. Not used for this flow as there are separate
     * flows for early stopping (no bookkeeping of tag paths etc here)
     */
    public shouldStop(part: any): boolean {
        return false;
    }

    /**
     * Called by byte parser when completing parser. Here we signal completion to the stream.
     */
    public complete(): void {
        this.push(null);
    }

    /**
     * Called by byte parser on error. Here we signal error to the stream.
     */
    public fail(error?: any): void {
        process.nextTick(() => this.emit("error", error));
    }

}

export function parseFlow(chunkSize?: number, inflate?: boolean, bufferBytes?: number): ParseFlow {
    return new ParseFlow(chunkSize, inflate, bufferBytes);
}
