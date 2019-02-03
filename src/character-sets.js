const iconv = require("iconv-lite");
const VR = require("./vr");

class CharacterSets {
    constructor(charsetNames) {
        if (charsetNames.includes("ISO 2022 IR 13") || charsetNames.includes("ISO 2022 IR 87") || charsetNames.includes("ISO 2022 IR 159"))
            console.warn("Charsets ISO 2022 IR 13, ISO 2022 IR 87 and ISO 2022 IR 159 not supported. Characters may not be displayed correctly.");
        this.charsetExtensionsEnabled = charsetNames.length > 1;
        this.charsetObjs = charsetNames.map(s => charsetsMap[s]).filter(o => o !== undefined);
        this.initialCharset = this.charsetObjs.length > 0 ? this.charsetObjs[0] : defaultCharsetObj;
    }

    decode(bytes, vr) {
        return vr ?
            isVrAffectedBySpecificCharacterSet(vr) ? this.decode(bytes) : defaultOnly.decode(bytes) :
            this.charsetExtensionsEnabled ? this.decodeWithExtensions(bytes) : iconv.decode(bytes, this.initialCharset.charset);
    }

    decodeWithExtensions(b) {
        let charsetObj = this.initialCharset;
        let off = 0;
        let cur = 0;
        let s = "";

        while (cur < b.length) {
            if (b[cur] === 0x1b) {
                // ESC
                if (off < cur)
                    s += iconv.decode(b.slice(off, cur), charsetObj.charset);
                cur += 3;
                let key = ((b[cur - 2] & 0xff) << 8) + (b[cur - 1] & 0xff);
                if (key === 0x2428 || key === 0x2429) {
                    key = (key << 8) + (b[cur] & 0xff);
                    cur += 1
                }
                let charsetMaybe = escToCharset[key];
                if (charsetMaybe)
                    charsetObj = charsetMaybe;
                else {
                    // decode invalid ESC sequence as chars
                    console.warn("Invalid escape sequence " + key.toString(16) + ", decoding as text");
                    let byteCount = (key & 0xff0000) !== 0 ? 4 : 3; // if second msb of key is set then 4 otherwise 3
                    s += iconv.decode(b.slice(cur - byteCount, cur), charsetObj.charset);
                }
                off = cur;
            } else // Step -1 -> chars in G0 one byte, chars in G1 two bytes.
                cur += (charsetObj.charLength > 0 ? charsetObj.charLength : b[cur] < 0 ? 2 : 1);
        }
        if (off < cur)
            s += iconv.decode(b.slice(off, cur), charsetObj.charset);
        return s;
    }

    toString() {
        return "CharacterSets [" + this.charsetObjs.map(c => c.charset).join(",") + "]";
    }
}

class CharsetObj {
    constructor(charset, charLength, escapeSequence) {
        this.charset = charset;
        this.charLength = charLength;
        this.escapeSequence = escapeSequence;
        this.hasEscapeSeq = this.escapeSequence !== undefined;
    }
}

const charsetsMap = {
    "": new CharsetObj("ISO-8859-1", 1), // default
    // Single-Byte Character Sets Without Code Extensions
    "ISO_IR 100": new CharsetObj("ISO-8859-1", 1),
    "ISO_IR 101": new CharsetObj("ISO-8859-2", 1),
    "ISO_IR 109": new CharsetObj("ISO-8859-3", 1),
    "ISO_IR 110": new CharsetObj("ISO-8859-4", 1),
    "ISO_IR 144": new CharsetObj("ISO-8859-5", 1),
    "ISO_IR 127": new CharsetObj("ISO-8859-6", 1),
    "ISO_IR 126": new CharsetObj("ISO-8859-7", 1),
    "ISO_IR 138": new CharsetObj("ISO-8859-8", 1),
    "ISO_IR 148": new CharsetObj("ISO-8859-9", 1),
    "ISO_IR 13": new CharsetObj("Shift_JIS", 1), // JIS_X0201
    "ISO_IR 166": new CharsetObj("tis620", 1),
    // Single-Byte Character Sets with Code Extensions
    "ISO 2022 IR 6": new CharsetObj("ISO-8859-1", 1, Buffer.from([0x28, 0x42])),
    "ISO 2022 IR 100": new CharsetObj("ISO-8859-1", 1, Buffer.from([0x2d, 0x41])),
    "ISO 2022 IR 101": new CharsetObj("ISO-8859-2", 1, Buffer.from([0x2d, 0x42])),
    "ISO 2022 IR 109": new CharsetObj("ISO-8859-3", 1, Buffer.from([0x2d, 0x43])),
    "ISO 2022 IR 110": new CharsetObj("ISO-8859-4", 1, Buffer.from([0x2d, 0x44])),
    "ISO 2022 IR 144": new CharsetObj("ISO-8859-5", 1, Buffer.from([0x2d, 0x4c])),
    "ISO 2022 IR 127": new CharsetObj("ISO-8859-6", 1, Buffer.from([0x2d, 0x47])),
    "ISO 2022 IR 126": new CharsetObj("ISO-8859-7", 1, Buffer.from([0x2d, 0x46])),
    "ISO 2022 IR 138": new CharsetObj("ISO-8859-8", 1, Buffer.from([0x28, 0x48])),
    "ISO 2022 IR 148": new CharsetObj("ISO-8859-9", 1, Buffer.from([0x28, 0x4d])),
    "ISO 2022 IR 13": new CharsetObj("Shift_JIS", 1, Buffer.from([0x29, 0x49])), // JIS_X0201
    "ISO 2022 IR 166": new CharsetObj("tis620", 1, Buffer.from([0x2d, 0x54])),
    // Multi-Byte Character Sets with Code Extensions
    "ISO 2022 IR 87": new CharsetObj("Shift_JIS", 2, Buffer.from([0x24, 0x42])), // X-JIS0208
    "ISO 2022 IR 159": new CharsetObj("Shift_JIS", 2, Buffer.from([0x24, 0x28, 0x44])), // JIS_X0212-1990
    "ISO 2022 IR 149": new CharsetObj("EUC-KR", -1, Buffer.from([0x24, 0x29, 0x43])),
    "ISO 2022 IR 58": new CharsetObj("GB2312", -1, Buffer.from([0x24, 0x29, 0x41])),
    // Multi-Byte Character Sets Without Code Extensions
    "ISO_IR 192": new CharsetObj("UTF-8", -1),
    "GB18030": new CharsetObj("GB18030", -1),
    "GBK": new CharsetObj("GBK", -1)
};

const escToCharset = Object.values(charsetsMap)
    .filter(co => co.hasEscapeSeq)
    .reduce((map, co) => {
        let v = co.escapeSequence.reduce((i, b) => (i << 8) + (b & 0xff), 0);
        map[v + ""] = co;
        return map;
    }, {});
escToCharset[0x284a + ""] = escToCharset[0x2949 + ""]; // ISO 2022 IR 13 has two escape sequences

const utf8Charset = "utf8";
const defaultCharset = "ISO-8859-1";
const defaultCharsetObj = new CharsetObj(defaultCharset, 1);
const defaultOnly = new CharacterSets([""]);

const isVrAffectedBySpecificCharacterSet = function (vr) {
    return vr === VR.LO || vr === VR.LT || vr === VR.PN || vr === VR.SH || vr === VR.ST || vr === VR.UT;
};

const fromName = function (name) {
    return new CharacterSets([name]);
};

const fromNames = function (names) {
    return new CharacterSets(names);
};

const fromBytes = function (specificCharacterSetBytes) {
    return !specificCharacterSetBytes || specificCharacterSetBytes.length === 0 ? defaultOnly : new CharacterSets(specificCharacterSetBytes.toString(utf8Charset));
};

const encode = function (s) {
    return Buffer.from(s, utf8Charset);
};

module.exports = {
    fromName: fromName,
    fromNames: fromNames,
    fromBytes: fromBytes,
    encode: encode,
    defaultOnly: defaultOnly
};
