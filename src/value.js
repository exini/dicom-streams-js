const base = require("./base");
const parsing = require("./parsing");
const VR = require("./vr");
const CharacterSets = require("./character-sets");

class Value {
    constructor(bytes) {
        this.bytes = bytes;
        this.length = bytes.length;
    }

    toStrings(vr, bigEndian, characterSets) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        characterSets = characterSets === undefined ? CharacterSets.defaultOnly: characterSets;
        if (length === 0) return [];
        if (vr === VR.AT) return parsing.parseAT(this.bytes, bigEndian).map(base.tagToString);
        if (vr === VR.FL) return parsing.parseFL(this.bytes, bigEndian).map(Number.toString);
        if (vr === VR.FD) return parsing.parseFD(this.bytes, bigEndian).map(Number.toString);
        if (vr === VR.SL) return parsing.parseSL(this.bytes, bigEndian).map(Number.toString);
        if (vr === VR.SS) return parsing.parseSS(this.bytes, bigEndian).map(Number.toString);
        if (vr === VR.UL) return parsing.parseSL(this.bytes, bigEndian).map(Number.toString);
        if (vr === VR.US) return parsing.parseSS(this.bytes, bigEndian).map(Number.toString);
        if (vr === VR.OB) return [this.bytes.length + " bytes"];
        if (vr === VR.OW) return [this.bytes.length / 2 + " words"];
        if (vr === VR.OF) return [parsing.parseFL(this.bytes, bigEndian).join(" ")];
        if (vr === VR.OD) return [parsing.parseFD(this.bytes, bigEndian).join(" ")];
        if (vr === VR.ST || vr === VR.LT || vr === VR.UT || vr === VR.UR) return [parsing.trimPadding(characterSets.decode(vr, this.bytes), vr.paddingByte)];
        if (vr === VR.UC) return parsing.split(parsing.trimPadding(characterSets.decode(vr, this.bytes), vr.paddingByte));
        return parsing.split(characterSets.decode(vr, this.bytes)).map(parsing.trim);
    }

    toString(vr, bigEndian, characterSets) {
        let strings = this.toStrings(vr, bigEndian, characterSets);
        return strings.length === 0 ? undefined : strings[0];
    }

    toSingleString(vr, bigEndian, characterSets) {
        let strings = this.toStrings(vr, bigEndian, characterSets);
        return strings.length === 0 ? undefined : strings.join(parsing.multiValueDelimiter);
    }

    add(bytes) {
        return new Value(base.concat(this.bytes, bytes));
    }

    ensurePadding(vr) {
        return new Value(parsing.padToEvenLength(this.bytes, vr));
    }
}

object Value {

    private combine(vr: VR, values: Seq[ByteString]): ByteString = vr match {
    case AT | FL | FD | SL | SS | UL | US | OB | OW | OL | OF | OD => values.reduce(_ ++ _)
    case _ => if (values.isEmpty) ByteString.empty else values.tail.foldLeft(values.head)((bytes, b) => bytes ++ ByteString('\\') ++ b)
    }

    /**
     * A Value with empty value
     */
    val empty: Value = Value(ByteString.empty)

    /**
     * Create a new Value, padding the input if necessary to ensure even length
     *
     * @param bytes     value bytes
     * @return a new Value
     */
    apply(vr: VR, bytes: ByteString): Value = Value(padToEvenLength(bytes, vr))

    private stringBytes(vr: VR, value: String, bigEndian: Boolean): ByteString = vr match {
    case AT => tagToBytes(Integer.parseInt(value, 16), bigEndian)
    case FL => floatToBytes(java.lang.Float.parseFloat(value), bigEndian)
    case FD => doubleToBytes(java.lang.Double.parseDouble(value), bigEndian)
    case SL => intToBytes(Integer.parseInt(value), bigEndian)
    case SS => shortToBytes(java.lang.Short.parseShort(value), bigEndian)
    case UL => truncate(4, longToBytes(java.lang.Long.parseUnsignedLong(value), bigEndian), bigEndian)
    case US => truncate(2, intToBytes(java.lang.Integer.parseUnsignedInt(value), bigEndian), bigEndian)
    case OB | OW | OL | OF | OD => throw new IllegalArgumentException("Cannot create binary array from string")
    case _ => ByteString(value)
    }
    fromString(vr: VR, value: String, bigEndian: Boolean = false): Value = apply(vr, stringBytes(vr, value, bigEndian))
    fromStrings(vr: VR, values: Seq[String], bigEndian: Boolean = false): Value = apply(vr, combine(vr, values.map(stringBytes(vr, _, bigEndian))))

}
