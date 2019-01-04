const base = require("./base");

class DicomPart {
    constructor(bigEndian, bytes) {
        this.bigEndian = bigEndian;
        this.bytes = bytes;
    }
}

module.exports = {
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
            this.explicitVR = explicitVR;
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
    }
};


