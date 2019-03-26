const base = require("./base");

class DicomPart {
    constructor(bigEndian, bytes) {
        this.bigEndian = bigEndian;
        this.bytes = bytes;
    }
}

class MetaPart extends DicomPart {
    constructor() {
        super(false, base.emptyBuffer);
    }
}

const self = module.exports = {
    DicomPart: DicomPart,

    PreamblePart: class extends DicomPart {
        constructor(bytes) {
            super(false, bytes);
        }

        toString() {
            return "Preamble []";
        }
    },

    HeaderPart: class extends DicomPart {
        constructor(tag, vr, length, isFmi, bigEndian, explicitVR, bytes) {
            super(bigEndian, bytes);
            this.tag = tag;
            this.vr = vr;
            this.length = length;
            this.isFmi = isFmi;
            this.explicitVR = explicitVR === undefined ? true : explicitVR;
            if (bytes === undefined) {
                this.bytes = this.explicitVR ?
                    vr.headerLength === 8 ?
                        Buffer.concat([base.tagToBytes(tag, bigEndian), Buffer.from(vr.name), base.shortToBytes(length, bigEndian)], 8) :
                        Buffer.concat([base.tagToBytes(tag, bigEndian), Buffer.from(vr.name), Buffer.from([0, 0]), base.intToBytes(length, bigEndian)], 12) :
                    Buffer.concat([base.tagToBytes(tag, bigEndian), base.intToBytes(length, bigEndian)], 8);
            }
        }

        withUpdatedLength(newLength) {
            if (newLength === this.length)
                return this;
            else {
                let updated = null;
                if ((this.bytes.length >= 8) && this.explicitVR && (this.vr.headerLength === 8)) { //explicit vr
                    updated = base.concat(this.bytes.slice(0, 6), base.shortToBytes(newLength, this.bigEndian));
                } else if ((this.bytes.length >= 12) && this.explicitVR && (this.vr.headerLength === 12)) { //explicit vr
                    updated = base.concat(this.bytes.slice(0, 8), base.intToBytes(newLength, this.bigEndian));
                } else { //implicit vr
                    updated = base.concat(this.bytes.slice(0, 4), base.intToBytes(newLength, this.bigEndian));
                }

                return new self.HeaderPart(this.tag, this.vr, newLength, this.isFmi, this.bigEndian, this.explicitVR, updated);
            }
        }

        toString() {
            return "Header [tag = " + base.tagToString(this.tag) + ", vr = " + this.vr.name + ", length = " + this.length + ", bigEndian = " + this.bigEndian + ", explicitVR = " + this.explicitVR + "]";
        }
    },

    ValueChunk: class extends DicomPart {
        constructor(bigEndian, bytes, last) {
            super(bigEndian, bytes);
            this.last = last;
        }

        toString() {
            let ascii = base.trim(this.bytes.slice(0, 100).toString("ascii").replace(/[^\x20-\x7E]/g, ""));
            if (this.bytes.length > 100)
                ascii = ascii + "...";
            return "ValueChunk [length = " + this.bytes.length + ", last = " + this.last + ", ascii = " + ascii + "]";
        }
    },

    DeflatedChunk: class extends DicomPart {
        constructor(bigEndian, bytes) {
            super(bigEndian, bytes);
        }

        toString() {
            return "DeflatedChunk [length = " + this.bytes.length + "]";
        }
    },

    ItemPart: class extends DicomPart {
        constructor(index, length, bigEndian, bytes) {
            super(bigEndian, bytes);
            this.index = index;
            this.length = length;
            this.indeterminate = length === base.indeterminateLength;
        }

        toString() {
            return "Item [length = " + this.length + ", index = " + this.index + "]";
        }
    },

    ItemDelimitationPart: class extends DicomPart {
        constructor(index, bigEndian, bytes) {
            super(bigEndian, bytes);
            this.index = index;
        }

        toString() {
            return "ItemDelimitation [index = " + this.index + "]";
        }
    },

    SequencePart: class extends DicomPart {
        constructor(tag, length, bigEndian, explicitVR, bytes) {
            super(bigEndian, bytes);
            this.tag = tag;
            this.length = length;
            this.explicitVR = explicitVR;
            this.indeterminate = length === base.indeterminateLength;
        }

        toString() {
            return "Sequence [tag = " + base.tagToString(this.tag) + ", length = " + this.length + "]";
        }
    },

    SequenceDelimitationPart: class extends DicomPart {
        constructor(bigEndian, bytes) {
            super(bigEndian, bytes);
        }

        toString() {
            return "SequenceDelimitation []";
        }
    },

    FragmentsPart: class extends DicomPart {
        constructor(tag, length, vr, bigEndian, explicitVR, bytes) {
            super(bigEndian, bytes);
            this.tag = tag;
            this.length = length;
            this.vr = vr;
            this.explicitVR = explicitVR;
        }

        toString() {
            return "Fragments [tag = " + base.tagToString(this.tag) + ", vr = " + this.vr.name + ", length = " + this.length + "]";
        }
    },

    UnknownPart: class extends DicomPart {
        constructor(bigEndian, bytes) {
            super(bigEndian, bytes);
        }

        toString() {
            return "Unknown []";
        }
    },

    MetaPart: MetaPart,

    ElementsPart: class extends MetaPart {
        constructor(label, elements) {
            super();
            this.label = label;
            this.elements = elements;
        }
    }

};


