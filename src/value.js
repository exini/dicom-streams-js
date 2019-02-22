const base = require("./base");
const VR = require("./vr");

// TODO support for types other than string

class Value {
    constructor(bytes) {
        this.bytes = bytes;
        this.length = bytes.length;
    }

    toStrings(vr, bigEndian, characterSets) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        characterSets = characterSets === undefined ? base.defaultCharacterSet: characterSets;
        if (this.length === 0) return [];
        if (vr === VR.AT) return parseAT(this.bytes, bigEndian).map(base.tagToString);
        if (vr === VR.FL) return parseFL(this.bytes, bigEndian).map(v => v.toString());
        if (vr === VR.FD) return parseFD(this.bytes, bigEndian).map(v => v.toString());
        if (vr === VR.SL) return parseSL(this.bytes, bigEndian).map(v => v.toString());
        if (vr === VR.SS) return parseSS(this.bytes, bigEndian).map(v => v.toString());
        if (vr === VR.UL) return parseUL(this.bytes, bigEndian).map(v => v.toString());
        if (vr === VR.US) return parseUS(this.bytes, bigEndian).map(v => v.toString());
        if (vr === VR.OB) return [this.bytes.length + " bytes"];
        if (vr === VR.OW) return [this.bytes.length / 2 + " words"];
        if (vr === VR.OF) return [parseFL(this.bytes, bigEndian).join(" ")];
        if (vr === VR.OD) return [parseFD(this.bytes, bigEndian).join(" ")];
        if (vr === VR.ST || vr === VR.LT || vr === VR.UT || vr === VR.UR) return [trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte)];
        if (vr === VR.UC) return splitString(trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte));
        return splitString(characterSets.decode(this.bytes, vr)).map(base.trim);
    }

    toSingleString(vr, bigEndian, characterSets) {
        let strings = this.toStrings(vr, bigEndian, characterSets);
        return strings.length === 0 ? "" : strings.join(base.multiValueDelimiter);
    }

    append(bytes) {
        return new Value(base.concat(this.bytes, bytes));
    }

    ensurePadding(vr) {
        return new Value(base.padToEvenLength(this.bytes, vr));
    }
}

const trimPadding = function(s, paddingByte) {
    let index = s.length - 1;
    while (index >= 0 && s[index] <= paddingByte)
        index -= 1;
    let n = s.length - 1 - index;
    return n > 0 ? s.substring(s.length - n, s.length) : s;
};

const combine = function(values, vr) {
    if (values.length === 0)
        return base.emptyBuffer;
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL || vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD)
        return values.reduce(base.concat);
    let delim = Buffer.from("\\");
    return values.reduce((prev, curr) => base.concatv(prev, delim, curr));
};

const empty = new Value(base.emptyBuffer);
const create = function(bytes, vr) { return vr ? new Value(base.padToEvenLength(bytes, vr)) : new Value(bytes); };

const stringBytes = function(vr, value, bigEndian) {
    if (vr === VR.AT) return base.tagToBytes(parseInt(value, 16), bigEndian);
    if (vr === VR.FL) return base.floatToBytes(parseFloat(value), bigEndian);
    if (vr === VR.FD) return base.doubleToBytes(parseFloat(value), bigEndian);
    if (vr === VR.SL) return base.intToBytes(parseInt(value), bigEndian);
    if (vr === VR.SS) return base.shortToBytes(parseInt(value), bigEndian);
    if (vr === VR.UL) return base.intToBytes(parseInt(value), bigEndian);
    if (vr === VR.US) return base.shortToBytes(parseInt(value), bigEndian);
    if (vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) throw Error("Cannot create binary array from string");
    return Buffer.from(value);
};

const fromString = function(vr, value, bigEndian) {
    bigEndian = bigEndian === undefined ? false : bigEndian;
    return create(stringBytes(vr, value, bigEndian), vr);
};

const fromStrings = function(vr, values, bigEndian) {
    bigEndian = bigEndian === undefined ? false : bigEndian;
    return create(combine(values.map(v => stringBytes(vr, v, bigEndian)), vr), vr)
};

const chunk = function(arr, len) {
    let chunks = [], i = 0, n = arr.length;
    while (i < n)
        chunks.push(arr.slice(i, i += len));
    return chunks;
};

const splitFixed = function(bytes, size) { return chunk(bytes, size).filter(g => g.length === size); };
const splitString = function(s) { return s.split(base.multiValueDelimiter); };

const parseAT = function(value, bigEndian) { return splitFixed(value, 4).map(b => base.bytesToTag(b, bigEndian)); };
const parseSL = function(value, bigEndian) { return splitFixed(value, 4).map(b => base.bytesToInt(b, bigEndian)); };
const parseSS = function(value, bigEndian) { return splitFixed(value, 2).map(b => base.bytesToShort(b, bigEndian)) };
const parseUL = function(value, bigEndian) { return splitFixed(value, 4).map(b => base.bytesToUInt(b, bigEndian)); };
const parseUS = function(value, bigEndian) { return splitFixed(value, 2).map(b => base.bytesToUShort(b, bigEndian)) };
const parseFL = function(value, bigEndian) { return splitFixed(value, 4).map(b => base.bytesToFloat(b, bigEndian)) };
const parseFD = function(value, bigEndian) { return splitFixed(value, 8).map(b => base.bytesToDouble(b, bigEndian)); };

module.exports = {
    empty: empty,
    create: create,
    fromString: fromString,
    fromStrings: fromStrings
};