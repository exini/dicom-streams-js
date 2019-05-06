const joda = require("js-joda");
const uuidv4 = require("uuid/v4");
const uuidv5 = require("uuid/v5");
const Lookup = require("./lookup");
const Tag = require("./tag");
const UID = require("./uid");
const {CharacterSets, defaultCharacterSet} = require("./character-sets");

const indeterminateLength = 0xFFFFFFFF;
const zero4Bytes = Buffer.from([0, 0, 0, 0]);

function concat(a, b) { return Buffer.concat([a, b], a.length + b.length); }
function concatv(...buffers) { return Buffer.concat(buffers); }
function flatten(array) { return [].concat.apply([], array); }
function appendToArray(object, array) {
    let newArray = array.slice();
    newArray.push(object);
    return newArray;
}
function prependToArray(object, array) {
    let newArray = array.slice();
    newArray.unshift(object);
    return newArray;
}
function concatArrays(array1, array2) {
    let newArray = array1.slice();
    array2.forEach(i => newArray.push(i));
    return newArray;
}

function tagToBytesBE(tag) { return intToBytesBE(tag); }
function tagToBytesLE(tag) { return Buffer.from([tag >> 16, tag >> 24, tag, tag >> 8]); }
function intToBytesBE(i) { return Buffer.from([i >> 24, i >> 16, i >> 8, i]); }
function intToBytesLE(i) { return Buffer.from([i, i >> 8, i >> 16, i >> 24]); }

const uidRoot = "2.25";
const uuidNamespace = "d181d67b-0a1c-45bf-8616-070f1bb0d0cf";

function hexToDec(s) {
    let i, j, digits = [0], carry;
    for (i = 0; i < s.length; i += 1) {
        carry = parseInt(s.charAt(i), 16);
        for (j = 0; j < digits.length; j += 1) {
            digits[j] = digits[j] * 16 + carry;
            carry = digits[j] / 10 | 0;
            digits[j] %= 10;
        }
        while (carry > 0) {
            digits.push(carry % 10);
            carry = carry / 10 | 0;
        }
    }
    return digits.reverse().join('');
}

function toUID(root, uuid) {
    let hexStr = uuid.replace(/-/g, '');
    let docStr = hexToDec(hexStr).replace(/^0+/, "");
    return (root + "." + docStr).substring(0, 64);
}

function nameBasedUID(name, root) { return toUID(root, uuidv5(name, uuidNamespace)); }
function randomUID(root) { return toUID(root, uuidv4()); }

const self = module.exports = {
    multiValueDelimiter: "\\",
    indeterminateLength: indeterminateLength,

    emptyBuffer: Buffer.alloc(0),
    zero4Bytes: zero4Bytes,

    toUInt32: function(num) { return num >>> 0 },
    toInt32: function(num) { return num >> 0 },
    shiftLeftUnsigned: function(num, n) { return self.toUInt32(num << n); },

    concat: concat,
    concatv: concatv,
    flatten: flatten,
    appendToArray: appendToArray,
    prependToArray: prependToArray,
    concatArrays: concatArrays,

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
    bytesToFloat: function(bytes, bigEndian) { return bigEndian ? self.bytesToFloatBE(bytes) : self.bytesToFloatLE(bytes); },
    bytesToFloatBE: function(bytes) { return bytes.readFloatBE(0); },
    bytesToFloatLE: function(bytes) { return bytes.readFloatLE(0); },
    bytesToDouble: function(bytes, bigEndian) { return bigEndian ? self.bytesToDoubleBE(bytes) : self.bytesToDoubleLE(bytes); },
    bytesToDoubleBE: function(bytes) { return bytes.readDoubleBE(0); },
    bytesToDoubleLE: function(bytes) { return bytes.readDoubleLE(0); },

    shortToBytes(i, bigEndian) { return bigEndian ? self.shortToBytesBE(i) : self.shortToBytesLE(i); },
    shortToBytesBE: function(i) { return Buffer.from([i >> 8, i]); },
    shortToBytesLE: function(i) { return Buffer.from([i, i >> 8]); },
    intToBytes: function(i, bigEndian) { return bigEndian ? self.intToBytesBE(i) : self.intToBytesLE(i); },
    intToBytesBE: intToBytesBE,
    intToBytesLE: intToBytesLE,
    tagToBytes: function(tag, bigEndian) { return bigEndian ? self.tagToBytesBE(tag) : self.tagToBytesLE(tag); },
    tagToBytesBE: tagToBytesBE,
    tagToBytesLE: tagToBytesLE,

    floatToBytes: function(f, bigEndian) {
        const buf = Buffer.allocUnsafe(4);
        if (bigEndian) buf.writeFloatBE(f, 0); else buf.writeFloatLE(f, 0);
        return buf;
    },
    doubleToBytes: function(f, bigEndian) {
        const buf = Buffer.allocUnsafe(8);
        if (bigEndian) buf.writeDoubleBE(f, 0); else buf.writeDoubleLE(f, 0);
        return buf;
    },

    tagToString: function(tag) {
        let hex = ("00000000" + tag.toString(16)).slice(-8);
        return "(" + hex.slice(0, 4) + "," + hex.slice(4, 8) + ")";
    },

    trim: function(s) { return s.replace(/^[\x00-\x20]*/g, "").replace(/[\x00-\x20]*$/g, ""); },

    padToEvenLength(bytes, tagOrVR) {
        let vr = isNaN(tagOrVR) ? tagOrVR : Lookup.vrOf(tagOrVR);
        return (bytes.length & 1) !== 0 ? self.concat(bytes, Buffer.from([vr.paddingByte])) : bytes;
    },

    itemLE: concat(tagToBytesLE(Tag.Item), intToBytesLE(indeterminateLength)),
    itemBE: concat(tagToBytesBE(Tag.Item), intToBytesBE(indeterminateLength)),
    item: function(length, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        length = length === undefined ? indeterminateLength : length;
        return length === indeterminateLength ? bigEndian ? self.itemBE : self.itemLE : self.concat(self.tagToBytes(Tag.Item, bigEndian), self.intToBytes(length, bigEndian));
    },

    itemDelimitationLE: concat(tagToBytesLE(Tag.ItemDelimitationItem), zero4Bytes),
    itemDelimitationBE: concat(tagToBytesBE(Tag.ItemDelimitationItem), zero4Bytes),
    itemDelimitation: function(bigEndian) { return bigEndian ? self.itemDelimitationBE : self.itemDelimitationLE; },

    sequenceDelimitationLE: concat(tagToBytesLE(Tag.SequenceDelimitationItem), zero4Bytes),
    sequenceDelimitationBE: concat(tagToBytesBE(Tag.SequenceDelimitationItem), zero4Bytes),
    sequenceDelimitation: function(bigEndian) { return bigEndian ? self.sequenceDelimitationBE : self.sequenceDelimitationLE; },
    sequenceDelimitationNonZeroLength: function(bigEndian) { return self.concatv(self.tagToBytes(Tag.SequenceDelimitationItem, bigEndian), self.intToBytes(0x00000010, bigEndian)); },

    isFileMetaInformation: function(tag) { return (tag & 0xFFFF0000) === 0x00020000; },
    isGroupLength: function(tag) { return self.elementNumber(tag) === 0; },
    isDeflated: function(transferSyntaxUid) { return transferSyntaxUid === UID.DeflatedExplicitVRLittleEndian || transferSyntaxUid === UID.JPIPReferencedDeflate; },

    systemZone: joda.ZoneId.SYSTEM,
    defaultCharacterSet: defaultCharacterSet,

    createUID: function() { return randomUID(uidRoot); },
    createUIDFromRoot: function(root) { return randomUID(root); },
    createNameBasedUID: function(name) { return nameBasedUID(name, uidRoot); },
    createNameBasedUIDFromRoot: function(name, root) { return nameBasedUID(name, root); }
};
