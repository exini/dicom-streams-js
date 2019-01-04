const self = module.exports = {
    shiftLeftUnsigned: function(num, n) {
        return num << n >>> 0;
    },
    trim: function(s) {
        return s.replace(/[\x00-\x20]*$/g, "");
    },

    indeterminateLength: 0xFFFFFFFF,

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

    emptyBuffer: Buffer.alloc(0),

    tagToString: function(tag) {
        return ("00000000" + tag.toString(16)).slice(-8);
    }
};