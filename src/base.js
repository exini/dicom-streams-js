const dictionary = require("./dictionary");
const Tag = require("./tag");

const indeterminateLength = 0xFFFFFFFF;
const zero4Bytes = Buffer.from([0, 0, 0, 0]);

function concat(a, b) {
    return Buffer.concat([a, b], a.length + b.length);
}

function concatv(...buffers) {
    return Buffer.concat(buffers);
}

function intToBytesBE(i) { return Buffer.from([i >> 24, i >> 16, i >> 8, i]); }
function intToBytesLE(i) { return Buffer.from([i, i >> 8, i >> 16, i >> 24]); }
function tagToBytesBE(tag) { return intToBytesBE(tag); }
function tagToBytesLE(tag) { return Buffer.from([tag >> 16, tag >> 24, tag, tag >> 8]); }

const self = module.exports = {
    shiftLeftUnsigned: function(num, n) {
        return num << n >>> 0;
    },
    trim: function(s) {
        return s.replace(/[\x00-\x20]*$/g, "");
    },
    concat: concat,
    concatv: concatv,

    indeterminateLength: indeterminateLength,

    groupNumber: function (tag) { return tag >>> 16; },
    elementNumber: function (tag) { return tag & 0xFFFF; },
    bytesToShort: function (bytes, bigEndian) { return bigEndian ? self.bytesToShortBE(bytes) : self.bytesToShortLE(bytes); },
    bytesToShortBE: function (bytes) { return bytes.readInt16BE(0) },
    bytesToShortLE: function (bytes) { return bytes.readInt16LE(0); },
    bytesToUShort: function (bytes, bigEndian) { return bigEndian ? self.bytesToUShortBE(bytes) : self.bytesToUShortLE(bytes); },
    bytesToUShortBE: function (bytes) { return bytes.readUInt16BE(0); },
    bytesToUShortLE: function (bytes) {return bytes.readUInt16LE(0); },
    bytesToTag: function (bytes, bigEndian) { return bigEndian ? self.bytesToTagBE(bytes) : self.bytesToTagLE(bytes); },
    bytesToTagBE: function (bytes) { return self.bytesToUIntBE(bytes); },
    bytesToTagLE: function (bytes) { return self.shiftLeftUnsigned(bytes.readUInt16LE(0), 16) + bytes.readUInt16LE(2); },
    bytesToVR: function (bytes) { return self.bytesToUShortBE(bytes); },
    bytesToInt: function (bytes, bigEndian) { return bigEndian ? self.bytesToIntBE(bytes) : self.bytesToIntLE(bytes); },
    bytesToIntBE: function (bytes) { return bytes.readInt32BE(0); },
    bytesToIntLE: function (bytes) { return bytes.readInt32LE(0); },
    bytesToUInt: function (bytes, bigEndian) { return bigEndian ? self.bytesToUIntBE(bytes) : self.bytesToUIntLE(bytes); },
    bytesToUIntBE: function (bytes) { return bytes.readUInt32BE(0); },
    bytesToUIntLE: function (bytes) { return bytes.readUInt32LE(0); },

    shortToBytes(i, bigEndian) { return bigEndian ? self.shortToBytesBE(i) : self.shortToBytesLE(i); },
    shortToBytesBE: function(i) { return Buffer.from([i >> 8, i]); },
    shortToBytesLE: function(i) { return Buffer.from([i, i >> 8]); },
    intToBytes: function(i, bigEndian) { return bigEndian ? self.intToBytesBE(i) : self.intToBytesLE(i); },
    intToBytesBE: intToBytesBE,
    intToBytesLE: intToBytesLE,
    longToBytes: function(i, bigEndian) { return bigEndian ? self.longToBytesBE(i) : self.longToBytesLE(i); },
    longToBytesBE: function(i) { return Buffer.from([i >> 56, i >> 48, i >> 40, i >> 32, i >> 24, i >> 16, i >> 8, i]); },
    longToBytesLE: function(i) { return Buffer.from([i, i >> 8, i >> 16, i >> 24, i >> 32, i >> 40, i >> 48, i >> 56]); },
    tagToBytes: function(tag, bigEndian) { return bigEndian ? self.tagToBytesBE(tag) : self.tagToBytesLE(tag); },
    tagToBytesBE: tagToBytesBE,
    tagToBytesLE: tagToBytesLE,

    emptyBuffer: Buffer.alloc(0),

    tagToString: function(tag) {
        let hex = ("00000000" + tag.toString(16)).slice(-8);
        return "(" + hex.slice(0, 4) + "," + hex.slice(4, 8) + ")";
    },

    padToEvenLength(bytes, tagOrVR) {
        let vr = isNaN(tagOrVR) ? tagOrVR : dictionary.vrOf(tagOrVR);
        return (bytes.length & 1) !== 0 ? concat(bytes, Buffer.from([vr.paddingByte])) : bytes;
    },

    itemLE: concat(tagToBytesLE(Tag.Item), intToBytesLE(indeterminateLength)),
    itemBE: concat(tagToBytesBE(Tag.Item), intToBytesBE(indeterminateLength)),
    item: function(length, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        length = length === undefined ? indeterminateLength : length;
        return length === indeterminateLength ? bigEndian ? self.itemBE : self.itemLE : concat(self.tagToBytes(Tag.Item, bigEndian), self.intToBytes(length, bigEndian));
    },

    itemDelimitationLE: concat(tagToBytesLE(Tag.ItemDelimitationItem), zero4Bytes),
    itemDelimitationBE: concat(tagToBytesBE(Tag.ItemDelimitationItem), zero4Bytes),
    itemDelimitation: function(bigEndian) { return bigEndian ? self.itemDelimitationBE : self.itemDelimitationLE; },

    sequenceDelimitationLE: concat(tagToBytesLE(Tag.SequenceDelimitationItem), zero4Bytes),
    sequenceDelimitationBE: concat(tagToBytesBE(Tag.SequenceDelimitationItem), zero4Bytes),
    sequenceDelimitation: function(bigEndian) { return bigEndian ? self.sequenceDelimitationBE : self.sequenceDelimitationLE; },
    sequenceDelimitationNonZeroLength: function(bigEndian) { return concatv(self.tagToBytes(Tag.SequenceDelimitationItem, bigEndian), self.intToBytes(0x00000010, bigEndian)); }

};