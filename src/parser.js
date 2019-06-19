const zlib = require("zlib");
const base = require("./base");
const Tag = require("./tag");
const UID = require("./uid");
const VR = require("./vr");
const Lookup = require("./lookup");
const {dicomPreambleLength, isPreamble, tryReadHeader, readHeader} = require("./parsing");
const {Value} = require("./value");
const {ByteParser, ParseStep, ParseResult} = require("./byte-parser");
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
    }

    parse(reader) {
        if (reader.remainingSize() < dicomPreambleLength + 8) {
            if (reader.remainingData().slice(0, 128).every(b => b === 0))
                reader.ensure(dicomPreambleLength + 8);
        } else if (isPreamble(reader.remainingData()))
            reader.take(dicomPreambleLength);
        reader.ensure(8);
        let info = tryReadHeader(reader.remainingData());
        if (info) {
            let nextState = info.hasFmi ?
                new InFmiAttribute(new FmiAttributeState(undefined, info.bigEndian, info.explicitVR, info.hasFmi, 0, undefined)) :
                new InAttribute(new AttributeState(0, info.bigEndian, info.explicitVR));
            return new ParseResult(undefined, nextState);
        } else
            throw new Error("Not a DICOM file");
    }

    onTruncation(reader) {
        if (reader.remainingSize() !== dicomPreambleLength || !isPreamble(reader.remainingData()))
            super.onTruncation(reader);
    }
}
const atBeginning = new AtBeginning();

class InFmiAttribute extends DicomParseStep {
    constructor(state) {
        super(state);
    }

    toDatasetStep(reader) {
        let tsuid = this.state.tsuid;
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
    
    parse(reader) {
        let header = readHeader(reader, this.state);
        if (base.groupNumber(header.tag) !== 2) {
            console.warn("Missing or wrong File Meta Information Group Length (0002,0000)");
            return new ParseResult(undefined, this.toDatasetStep(reader));
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
            this.state.fmiEndPos && this.state.fmiEndPos <= this.state.pos ? this.toDatasetStep(reader) : this
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

class Parser {
    constructor(stop, filter) {
        this.stop = stop;
        this.filter = filter;

        this._builder = new ElementsBuilder();
        this._byteParser = new ByteParser(this);
        this._byteParser.startWith(atBeginning);
    }

    /**
     * Parse the input binary data, producing DICOM elements that are added to the internal builder. An elements
     * structure can be fetched based on the builder at any time.
     */
    parse(chunk) {
        if (this._byteParser.current.state && this._byteParser.current.state.inflater)
            chunk = this._byteParser.current.state.inflater.inflate(chunk);
        this._byteParser.parse(chunk);
    }

    /**
     * Called by byte parser to support early stopping. If stop function is supplied and it returns true for
     * the given element, parsing will stop. Element will not be added to builder.
     */
    shouldStop(element) {
        return this.stop && element && this.stop(element, this._builder.currentDepth());
    }

    /**
     * Called by byte parser when it is emitting the next parsed element. Check if element should be added
     * according to the input filter and add the element to the builder if ok.
     */
    next(element) {
        if (!this.filter || this.filter(element, this._builder.currentDepth()))
            this._builder.addElement(element);
    }

    /**
     * Get the current elements as represented by the builder
     */
    result() {
        return this._builder.result();
    }

    /**
     * Returns true the parser has completed parsing (stop condition was met)
     */
    isComplete() {
        return this._byteParser.isCompleted;
    }

    /**
     * Called by byte parser when completing parser. Nothing to do here.
     */
    complete() {}

    /**
     * Called by byte parser on error. Here we just throw the error.
     */
    fail(error) {
        throw error;
    }
}

module.exports = {
    Parser: Parser
};
