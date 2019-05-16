const { convertBytes } = require("../lib/dicom-character-set.min");
const VR = require("./vr");

class CharacterSets {
    constructor(charsets) {
        this.charsets = charsets;
    }

    static isVrAffectedBySpecificCharacterSet(vr) {
        return vr === VR.LO || vr === VR.LT || vr === VR.PN || vr === VR.SH || vr === VR.ST || vr === VR.UT;
    }

    static fromNames(names) {
        return new CharacterSets(names);
    }

    static fromBytes(specificCharacterSetBytes) {
        return !specificCharacterSetBytes || specificCharacterSetBytes.length === 0 ? defaultCharacterSet : new CharacterSets(specificCharacterSetBytes.toString());
    }

    static encode(s) {
        return Buffer.from(s, "utf8");
    }

    static defaultOnly() {
        return new CharacterSets("");
    }

    decode(bytes, vr) {
        try {
            return convertBytes(this.charsets, bytes, {vr: vr.name});
        } catch (err) {
            console.warn("Invalid character set: " + this.charsets + ", using default instead.");
            return defaultCharacterSet.decode(bytes, vr);
        }
    }

    toString() {
        return "CharacterSets [" + this.charsets.split("\\").join(",") + "]";
    }
}

const defaultCharacterSet = CharacterSets.defaultOnly();

module.exports = {
    CharacterSets: CharacterSets,
    defaultCharacterSet: defaultCharacterSet
};
