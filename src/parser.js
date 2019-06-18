const zlib = require("zlib");
const base = require("./base");
const Tag = require("./tag");
const UID = require("./uid");
const VR = require("./vr");
const Lookup = require("./lookup");
const {Value} = require("./value");
const {ByteParser, ParseStep, ParseResult, finishedParser} = require("./byte-parser");
const {ElementsBuilder} = require("./elements-builder");
const {
    UnknownElement, ValueElement, SequenceElement, SequenceDelimitationElement, FragmentsElement, ItemElement, 
    ItemDelimitationElement, FragmentElement
} = require("./elements");

class Inflater {
    inflate(bytes) {
        return bytes;
    }
}

class FmiAttributeState {
    constructor(tsuid, bigEndian, explicitVR, hasFmi, pos, fmiEndPos) {
        this.tsuid = tsuid;
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
        this.hasFmi = hasFmi;
        this.pos = pos;
        this.fmiEndPos = fmiEndPos;
    }
}

class AttributeState {
    constructor(itemIndex, bigEndian, explicitVR, inflater) {
        this.itemIndex = itemIndex;
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
        this.inflater = inflater;
    }    
}

class FragmentsState {
    constructor(fragmentIndex, bigEndian, explicitVR, inflater) {
        this.fragmentIndex = fragmentIndex;
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
        this.inflater = inflater;
    }
}

class DicomParseStep extends ParseStep {
    constructor(state) {
        super();
        this.state = state;
    }
}

class AtBeginning extends DicomParseStep {
    constructor() {
        super(null);
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
        if (reader.remainingSize() < this.dicomPreambleLength + 8) {
            if (reader.remainingData().slice(0, 128).every(b => b === 0))
                reader.ensure(this.dicomPreambleLength + 8);
        } else if (this.isPreamble(reader.remainingData()))
            reader.take(this.dicomPreambleLength);
        reader.ensure(8);
        let info = AtBeginning.tryReadHeader(reader.remainingData());
        if (info) {
            let nextState = info.hasFmi ?
                new InFmiAttribute(new FmiAttributeState(undefined, info.bigEndian, info.explicitVR, info.hasFmi, 0, undefined)) :
                new InAttribute(new AttributeState(0, info.bigEndian, info.explicitVR));
            return new ParseResult(undefined, nextState);
        } else
            throw new Error("Not a DICOM stream");
    }

    onTruncation(reader) {
        if (reader.remainingSize() !== this.dicomPreambleLength || !this.isPreamble(reader.remainingData()))
            super.onTruncation(reader);
    }
}
const atBeginning = new AtBeginning();

class InFmiAttribute extends DicomParseStep {
    constructor(state) {
        super(state);
    }

    parse(reader) {
        let header = readHeader(reader, this.state);
        if (base.groupNumber(header.tag) !== 2) {
            console.warn("Missing or wrong File Meta Information Group Length (0002,0000)");
            return new ParseResult(undefined, toDatasetStep(reader, this.state));
        }
        let updatedVr = header.vr === VR.UN ? Lookup.vrOf(header.tag) : header.vr;
        let bytes = reader.take(header.headerLength + header.valueLength);
        let valueBytes = bytes.slice(header.headerLength);
        this.state.pos += header.headerLength + header.valueLength;
        if (header.tag === Tag.FileMetaInformationGroupLength)
            this.state.fmiEndPos = this.state.pos + base.bytesToInt(valueBytes, this.state.bigEndian);
        else if (header.tag === Tag.TransferSyntaxUID)
            this.state.tsuid = base.trim(valueBytes.toString());
        return new ParseResult(
            new ValueElement(header.tag, updatedVr, new Value(valueBytes), this.state.bigEndian, this.state.explicitVR), 
            this.state.fmiEndPos && this.state.fmiEndPos <= this.state.pos ? toDatasetStep(reader, this.state) : this
        );
    }
}

class InAttribute extends DicomParseStep {
    constructor(state) {
        super(state);
    }

    parse(reader) {
        let header = readHeader(reader, this.state);
        reader.take(header.headerLength);
        if (header.vr) {
            if (header.vr === VR.SQ || header.vr === VR.UN && header.valueLength === base.indeterminateLength)
                return new ParseResult(
                    new SequenceElement(header.tag, header.valueLength, this.state.bigEndian, this.state.explicitVR),
                    new InAttribute(new AttributeState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
                );
            if (header.valueLength === base.indeterminateLength)
                return new ParseResult(
                    new FragmentsElement(header.tag, header.vr, this.state.bigEndian, this.state.explicitVR),
                    new InFragments(new FragmentsState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
                );
            return new ParseResult(
                new ValueElement(header.tag, header.vr, new Value(reader.take(header.valueLength)), this.state.bigEndian, this.state.explicitVR),
                this
            );
        }
        switch (header.tag) {
            case 0xFFFEE000:
                return new ParseResult(
                    new ItemElement(this.state.itemIndex + 1, header.valueLength, this.state.bigEndian),
                    new InAttribute(new AttributeState(this.state.itemIndex + 1, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
                );
            case 0xFFFEE00D:
                    return new ParseResult(
                        new ItemDelimitationElement(this.state.itemIndex, this.state.bigEndian),
                        new InAttribute(new AttributeState(this.state.itemIndex, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
                    );
            case 0xFFFEE0DD:
                    return new ParseResult(
                        new SequenceDelimitationElement(this.state.bigEndian),
                        new InAttribute(new AttributeState(this.state.itemIndex, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
                    );
        }
        return new ParseResult(new UnknownElement(this.state.bigEndian), this);
    }
}

class InFragments extends DicomParseStep {
    constructor(state) {
        super(state);
    }

    parse(reader) {
        let header = readHeader(reader, this.state);
        reader.take(header.headerLength);
        if (header.tag === 0xFFFEE000) { // begin fragment
            let valueBytes = reader.take(header.valueLength);
            return new ParseResult(
                new FragmentElement(this.state.fragmentIndex + 1, header.valueLength, new Value(valueBytes), this.state.bigEndian),
                new InFragments(new FragmentsState(this.state.fragmentIndex + 1, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
            );
        }
        if (header.tag === 0xFFFEE0DD) { // end fragments
            if (header.valueLength !== 0) {
                console.warn("Unexpected fragments delimitation length " + header.valueLength);
            }
            return new ParseResult(
                new SequenceDelimitationElement(this.state.bigEndian), 
                new InAttribute(new AttributeState(0, this.state.bigEndian, this.state.explicitVR, this.state.inflater))
            );
        }
        reader.take(header.valueLength);
        console.warn("Unexpected element (" + base.tagToString(header.tag) + ") in fragments with length " + header.valueLength);
        return new ParseResult(new UnknownElement(this.state.bigEndian), this);
    }
}

function toDatasetStep(reader, state) {
    let tsuid = state.tsuid;
    if (!tsuid) {
        console.warn("Missing Transfer Syntax (0002,0010) - assume Explicit VR Little Endian");
        tsuid = UID.ExplicitVRLittleEndian;
    }

    let bigEndian = tsuid === UID.ExplicitVRBigEndianRetired;
    let explicitVR = tsuid !== UID.ImplicitVRLittleEndian;

    let inflater = undefined;

    if (base.isDeflated(tsuid)) {
        reader.ensure(2);

        inflater = new class extends Inflater {
            inflate(bytes) {
                return zlib.inflateRawSync(bytes);
            }
        };

        let firstTwoBytes = reader.remainingData().slice(0, 2);
        let hasZLIBHeader = base.bytesToUShortBE(firstTwoBytes) === 0x789C;

        if (hasZLIBHeader) {
            console.warn("Deflated DICOM Stream with ZLIB Header");
            inflater = new class extends Inflater {
                inflate(bytes) {
                    return zlib.inflateSync(bytes);
                }
            };
        }

        reader.setInput(inflater.inflate(reader.remainingData()));
    }
    return new InAttribute(new AttributeState(0, bigEndian, explicitVR, inflater));
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

class Parser {
    constructor() {
        this.elements = undefined;
        this._builder = new ElementsBuilder();
        this._byteParser = new ByteParser(this);
        this._byteParser.startWith(atBeginning);
    }

    parse(chunk) {
        if (this._byteParser.current.state && this._byteParser.current.state.inflater)
            chunk = this._byteParser.current.state.inflater.inflate(chunk);
        this._byteParser.parse(chunk);
    }

    flush() {
        this._byteParser.flush();
    }

    next(element) {
        this._builder.addElement(element);
    }

    complete() {
        this.elements = this._builder.result();
        this._byteParser = null;
        this._builder = null;
    }

    fail(error) {
        throw error;
    }
}

module.exports = {
    Parser: Parser
};
