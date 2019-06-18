const zlib = require("zlib");
const base = require("./base");
const Tag = require("./tag");
const UID = require("./uid");
const VR = require("./vr");
const {PreamblePart, HeaderPart, ValueChunk, SequencePart, SequenceDelimitationPart, ItemPart, ItemDelimitationPart,
    FragmentsPart, UnknownPart, DeflatedChunk} = require("./parts");
const Lookup = require("./lookup");
const {Detour} = require("./detour");
const {ByteParser, ParseStep, ParseResult, finishedParser} = require("./byte-parser");

class DicomParseStep extends ParseStep {
    constructor(state, flow) {
        super();
        this.state = state;
        this.flow = flow;
    }
}

class DatasetHeaderState {
    constructor(itemIndex, bigEndian, explicitVR) {
        this.itemIndex = itemIndex;
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
    }
}

class FmiHeaderState {
    constructor(tsuid, bigEndian, explicitVR, hasFmi, pos, fmiEndPos) {
        this.tsuid = tsuid;
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
        this.hasFmi = hasFmi;
        this.pos = pos;
        this.fmiEndPos = fmiEndPos;
    }
}

class ValueState {
    constructor(bigEndian, bytesLeft, nextStep) {
        this.bigEndian = bigEndian;
        this.bytesLeft = bytesLeft;
        this.nextStep = nextStep;
    }
}

class FragmentsState {
    constructor(fragmentIndex, bigEndian, explicitVR) {
        this.fragmentIndex = fragmentIndex;
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
    }
}

class AtBeginning extends DicomParseStep {
    constructor(flow) {
        super(null, flow);
        this.dicomPreambleLength = 132;

    }

    static isDICM(bytes) {
        return bytes[0] === 68 && bytes[1] === 73 && bytes[2] === 67 && bytes[3] === 77;
    }

    static tryReadHeader(data) {
        let info = this.dicomInfo(data, false);
        return info === undefined ? this.dicomInfo(data, true) : info;

    }
    static dicomInfo(data, assumeBigEndian) {
        let tag1 = base.bytesToTag(data, assumeBigEndian);
        let vr = Lookup.vrOf(tag1);
        if (vr === VR.UN)
            return undefined;
        if (base.bytesToVR(data.slice(4, 6)) === vr.code)
            return { bigEndian: assumeBigEndian, explicitVR: true, hasFmi: base.isFileMetaInformation(tag1) };
        if (base.bytesToUInt(data.slice(4, 8), assumeBigEndian) >= 0)
            if (assumeBigEndian)
                throw Error("Implicit VR Big Endian encoded DICOM Stream");
            else
                return { bigEndian: false, explicitVR: false, hasFmi: base.isFileMetaInformation(tag1) };
        return undefined;
    }

    isPreamble(data) {
        return data.length >= this.dicomPreambleLength && AtBeginning.isDICM(data.slice(this.dicomPreambleLength - 4, this.dicomPreambleLength));
    }

    parse(reader) {
        let maybePreamble = undefined;
        if (reader.remainingSize() < this.dicomPreambleLength + 8) {
            if (reader.remainingData().slice(0, 128).every(b => b === 0))
                reader.ensure(this.dicomPreambleLength + 8);
        } else if (this.isPreamble(reader.remainingData()))
            maybePreamble = new PreamblePart(reader.take(this.dicomPreambleLength));
        reader.ensure(8);
        let info = AtBeginning.tryReadHeader(reader.remainingData());
        if (info) {
            let nextState = info.hasFmi ?
                new InFmiHeader(new FmiHeaderState(undefined, info.bigEndian, info.explicitVR, info.hasFmi, 0, undefined), this.flow) :
                new InDatasetHeader(new DatasetHeaderState(0, info.bigEndian, info.explicitVR), this.flow);
            return new ParseResult(maybePreamble, nextState);
        } else
            throw new Error("Not a DICOM stream");
    }

    onTruncation(reader) {
        if (reader.remainingSize() === this.dicomPreambleLength && this.isPreamble(reader.remainingData()))
            this.flow.push(new PreamblePart(reader.take(this.dicomPreambleLength)));
        else
            super.onTruncation(reader);
    }
}

class InFmiHeader extends DicomParseStep {
    constructor(state, flow) {
        super(state, flow);
        this.transferSyntaxLengthLimit = 1024;
    }

    parse(reader) {
        let header = readHeader(reader, this.state);
        if (base.groupNumber(header.tag) !== 2) {
            console.warn("Missing or wrong File Meta Information Group Length (0002,0000)");
            return new ParseResult(undefined, toDatasetStep(reader, header.valueLength, this.state, this.flow));
        }
        let updatedVr = header.vr === VR.UN ? Lookup.vrOf(header.tag) : header.vr;
        let bytes = reader.take(header.headerLength);
        this.state.pos += header.headerLength + header.valueLength;
        if (header.tag === Tag.FileMetaInformationGroupLength) {
            reader.ensure(4);
            let valueBytes = reader.remainingData().slice(0, 4);
            this.state.fmiEndPos = this.state.pos + base.bytesToInt(valueBytes, this.state.bigEndian);
        } else if (header.tag === Tag.TransferSyntaxUID)
            if (header.valueLength < this.transferSyntaxLengthLimit) {
                reader.ensure(header.valueLength);
                let valueBytes = reader.remainingData().slice(0, header.valueLength);
                this.state.tsuid = base.trim(valueBytes.toString());
            } else
                console.warn("Transfer syntax data is very large, skipping");
        let part = new HeaderPart(header.tag, updatedVr, header.valueLength, true, this.state.bigEndian, this.state.explicitVR, bytes);
        let nextStep = new InFmiHeader(this.state, this.flow);
        if (this.state.fmiEndPos && this.state.fmiEndPos <= this.state.pos)
            nextStep = toDatasetStep(reader, header.valueLength, this.state, this.flow);
        return new ParseResult(part, new InValue(new ValueState(this.state.bigEndian, header.valueLength, nextStep), this.flow));
    }
}

class InDatasetHeader extends DicomParseStep {
    constructor(state, flow) {
        super(state, flow);
    }

    parse(reader) {
        let part = readDatasetHeader(reader, this.state);
        let nextState = finishedParser;
        if (part) {
            if (part instanceof HeaderPart)
                if (part.length > 0)
                    nextState = new InValue(new ValueState(part.bigEndian, part.length, new InDatasetHeader(this.state, this.flow)), this.flow);
                else
                    nextState = new InDatasetHeader(this.state, this.flow);
            else if (part instanceof FragmentsPart)
                nextState = new InFragments(new FragmentsState(0, part.bigEndian, this.state.explicitVR), this.flow);
            else if (part instanceof SequencePart)
                nextState = new InDatasetHeader(new DatasetHeaderState(0, this.state.bigEndian, this.state.explicitVR), this.flow);
            else if (part instanceof ItemPart)
                nextState = new InDatasetHeader(new DatasetHeaderState(part.index, this.state.bigEndian, this.state.explicitVR), this.flow);
            else if (part instanceof ItemDelimitationPart)
                nextState = new InDatasetHeader(new DatasetHeaderState(part.index, this.state.bigEndian, this.state.explicitVR), this.flow);
            else if (part instanceof SequenceDelimitationPart)
                nextState = new InDatasetHeader(new DatasetHeaderState(part.index, this.state.bigEndian, this.state.explicitVR), this.flow);
            else
                nextState = new InDatasetHeader(this.state, this.flow);
        }
        return new ParseResult(part, nextState);
    }
}

class InValue extends DicomParseStep {
    constructor(state, flow) {
        super(state, flow);
    }

    parse(reader) {
        return this.state.bytesLeft <= this.flow.chunkSize ?
            new ParseResult(new ValueChunk(this.state.bigEndian, reader.take(this.state.bytesLeft), true), this.state.nextStep) :
            new ParseResult(new ValueChunk(this.state.bigEndian, reader.take(this.flow.chunkSize), false), new InValue(new ValueState(this.state.bigEndian, this.state.bytesLeft - this.flow.chunkSize, this.state.nextStep), this.flow));
    }
}

class InFragments extends DicomParseStep {
    constructor(state, flow) {
        super(state, flow);
    }

    parse(reader) {
        let header = readHeader(reader, this.state);
        if (header.tag === 0xFFFEE000) { // begin fragment
            let nextState = header.valueLength > 0 ?
                new InValue(new ValueState(this.state.bigEndian, header.valueLength, new InFragments(new FragmentsState(this.state.fragmentIndex + 1, this.state.bigEndian, this.state.explicitVR), this.flow)), this.flow) :
                new InFragments(new FragmentsState(this.state.fragmentIndex + 1, this.state.bigEndian, this.state.explicitVR), this.flow);
            return new ParseResult(new ItemPart(this.state.fragmentIndex + 1, header.valueLength, this.state.bigEndian, reader.take(header.headerLength)), nextState);
        }
        if (header.tag === 0xFFFEE0DD) { // end fragments
            if (header.valueLength !== 0) {
                console.warn("Unexpected fragments delimitation length " + header.valueLength);
            }
            return new ParseResult(new SequenceDelimitationPart(this.state.bigEndian, reader.take(header.headerLength)), new InDatasetHeader(new DatasetHeaderState(0, this.state.bigEndian, this.state.explicitVR), this.flow));
        }
        console.warn("Unexpected element (" + base.tagToString(header.tag) + ") in fragments with length " + header.valueLength);
        return new ParseResult(new UnknownPart(this.state.bigEndian, reader.take(header.headerLength + header.valueLength)), this);
    }
}

class InDeflatedData extends DicomParseStep {
    constructor(state, flow) {
        super(state, flow);
    }

    parse(reader) {
        return new ParseResult(new DeflatedChunk(this.state.bigEndian, reader.take(Math.min(this.flow.chunkSize, reader.remainingSize()))), this);
    }
}

function toDatasetStep(reader, valueLength, state, flow) {
    let tsuid = state.tsuid;
    if (!tsuid) {
        console.warn("Missing Transfer Syntax (0002,0010) - assume Explicit VR Little Endian");
        tsuid = UID.ExplicitVRLittleEndian;
    }

    let bigEndian = tsuid === UID.ExplicitVRBigEndianRetired;
    let explicitVR = tsuid !== UID.ImplicitVRLittleEndian;

    if (base.isDeflated(tsuid)) {
        if (flow.inflate) {
            reader.ensure(valueLength + 2);

            let inflater = zlib.createInflateRaw();

            let firstTwoBytes = reader.remainingData().slice(valueLength, valueLength + 2);
            let hasZLIBHeader = base.bytesToUShortBE(firstTwoBytes) === 0x789C;

            if (hasZLIBHeader) {
                console.warn("Deflated DICOM Stream with ZLIB Header");
                inflater = zlib.createInflate();
            }

            let valueBytes = reader.take(valueLength);
            let remainingBytes = reader.remainingData();

            reader.setInput(valueBytes);
            flow.setDetourFlow(inflater);
            flow.setDetour(true, remainingBytes);
        } else
            return new InDeflatedData(state, flow);
    }
    return new InDatasetHeader(new DatasetHeaderState(0, bigEndian, explicitVR), flow);
}

function readTagVr(data, bigEndian, explicitVr) {
    let tag = base.bytesToTag(data, bigEndian);
    if (tag === 0xFFFEE000 || tag === 0xFFFEE00D || tag === 0xFFFEE0DD)
        return {tag: tag, vr: null};
    if (explicitVr)
        return {tag: tag, vr: VR.valueOf(base.bytesToVR(data.slice(4, 6)))};
    return {tag: tag, vr: Lookup.vrOf(tag)};
}

function readHeader(reader, state) {
    reader.ensure(8);
    let tagVrBytes = reader.remainingData().slice(0, 8);
    let tagVr = readTagVr(tagVrBytes, state.bigEndian, state.explicitVR);
    if (tagVr.vr && state.explicitVR) {
        if (tagVr.vr.headerLength === 8)
            return {
                tag: tagVr.tag,
                vr: tagVr.vr,
                headerLength: 8,
                valueLength: base.bytesToUShort(tagVrBytes.slice(6), state.bigEndian)
            };
        reader.ensure(12);
        return {
            tag: tagVr.tag,
            vr: tagVr.vr,
            headerLength: 12,
            valueLength: base.bytesToUInt(reader.remainingData().slice(8), state.bigEndian)
        };
    }
    return {
        tag: tagVr.tag,
        vr: tagVr.vr,
        headerLength: 8,
        valueLength: base.bytesToUInt(tagVrBytes.slice(4), state.bigEndian)
    };
}

function readDatasetHeader(reader, state) {
    let header = readHeader(reader, state);
    if (header.vr) {
        let bytes = reader.take(header.headerLength);
        if (header.vr === VR.SQ || header.vr === VR.UN && header.valueLength === base.indeterminateLength)
            return new SequencePart(header.tag, header.valueLength, state.bigEndian, state.explicitVR, bytes);
        if (header.valueLength === base.indeterminateLength)
            return new FragmentsPart(header.tag, header.valueLength, header.vr, state.bigEndian, state.explicitVR, bytes);
        return new HeaderPart(header.tag, header.vr, header.valueLength, false, state.bigEndian, state.explicitVR, bytes);
    }
    switch (header.tag) {
        case 0xFFFEE000:
            return new ItemPart(state.itemIndex + 1, header.valueLength, state.bigEndian, reader.take(8));
        case 0xFFFEE00D:
            return new ItemDelimitationPart(state.itemIndex, state.bigEndian, reader.take(8));
        case 0xFFFEE0DD:
            return new SequenceDelimitationPart(state.bigEndian, reader.take(8));
    }
    return new UnknownPart(state.bigEndian, reader.take(header.headerLength))
}

class ParseFlow extends Detour {
    constructor(chunkSize, inflate, bufferBytes) {
        super({writableHighWaterMark: bufferBytes || 1024 * 1024, readableObjectMode: true});

        this.chunkSize = chunkSize || 1024 * 1024;
        this.inflate = inflate === undefined ? true : inflate;
        this.parser = new ByteParser(this);
        this.parser.startWith(new AtBeginning(this));
    }

    process(chunk) {
        this.parser.parse(chunk);
    }

    cleanup() {
        this.parser.flush();
    }

    next(part) {
        this.push(part);
    }

    complete() {
        this.push(null);
    }

    fail(error) {
        process.nextTick(() => this.emit("error", error));
    }

}

function parseFlow(chunkSize, inflate, bufferBytes) { return new ParseFlow(chunkSize, inflate, bufferBytes); }

module.exports = {
    parseFlow: parseFlow
};
