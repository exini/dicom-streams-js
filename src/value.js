const joda = require("js-joda");
const base = require("./base");
const VR = require("./vr");

class Value {
    constructor(bytes) {
        this.bytes = bytes;
        this.length = bytes.length;
    }

    static fromString(vr, value, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        return create(stringBytes(vr, value, bigEndian), vr);
    };

    static fromStrings(vr, values, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        return create(combine(values.map(v => stringBytes(vr, v, bigEndian)), vr), vr)
    };

    static fromBuffer(vr, buffer) { return create(buffer, vr); }

    static fromBytes(vr, bytes) { return Value.fromBuffer(vr, Buffer.from(bytes)); }

    static fromNumber(vr, value, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        return create(numberBytes(vr, value, bigEndian), vr) ;
    }
    static fromNumbers(vr, values, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        return create(combine(values.map(v => numberBytes(vr, v, bigEndian)), vr), vr);
    }

    static fromDate(vr, value) { return create(dateBytes(vr, value), vr); }
    static fromDates(vr, values) { return create(combine(values.map(v => dateBytes(vr, v)), vr), vr); }

    static fromTime(vr, value) { return create(timeBytes(vr, value), vr); }
    static fromTimes(vr, values) { return create(combine(values.map(v => timeBytes(vr, v)), vr), vr); }

    static fromDateTime(vr, value) { return create(dateTimeBytes(vr, value), vr); }
    static fromDateTimes(vr, values) { return create(combine(values.map(v => dateTimeBytes(vr, v)), vr), vr); }

    static empty() { return new Value(base.emptyBuffer); }

    static _headOption(array) { return array.length > 0 ? array[0] : undefined; }

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
        if (vr === VR.DA || vr === VR.TM || vr === VR.DT) return splitString(this.bytes.toString()).map(base.trim);
        if (vr === VR.UC) return splitString(trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte));
        return splitString(characterSets.decode(this.bytes, vr)).map(base.trim);
    }

    toSingleString(vr, bigEndian, characterSets) {
        characterSets = characterSets === undefined ? base.defaultCharacterSet: characterSets;
        if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
            vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OF || vr === VR.OD) {
            let strings = this.toStrings(vr, bigEndian, characterSets);
            return strings.length === 0 ? "" : strings.join(base.multiValueDelimiter);
        }
        if (vr === VR.ST || vr === VR.LT || vr === VR.UT || vr === VR.UR) return trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte);
        if (vr === VR.DA || vr === VR.TM || vr === VR.DT) return base.trim(this.bytes.toString());
        if (vr === VR.UC) return trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte);
        return base.trim(characterSets.decode(this.bytes, vr));
    }

    toNumbers(vr, bigEndian) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        if (this.length === 0) return [];
        if (vr === VR.AT) return parseAT(this.bytes, bigEndian);
        if (vr === VR.DS) return parseDS(this.bytes).filter(n => !isNaN(n));
        if (vr === VR.FL) return parseFL(this.bytes, bigEndian);
        if (vr === VR.FD) return parseFD(this.bytes, bigEndian);
        if (vr === VR.IS) return parseIS(this.bytes).filter(n => !isNaN(n));
        if (vr === VR.SL) return parseSL(this.bytes, bigEndian);
        if (vr === VR.SS) return parseSS(this.bytes, bigEndian);
        if (vr === VR.UL) return parseUL(this.bytes, bigEndian);
        if (vr === VR.US) return parseUS(this.bytes, bigEndian);
        return [];
    }

    toDates(vr) {
        vr = vr === undefined ? VR.DA : vr;
        if (vr === VR.DA) return parseDA(this.bytes);
        if (vr === VR.DT) return parseDT(this.bytes, base.systemZone).map(dt => dt.toLocalDate());
        return [];
    }

    toTimes(vr) {
        vr = vr === undefined ? VR.TM : vr;
        if (vr === VR.DT) return parseDT(this.bytes, base.systemZone).map(dt => dt.toLocalTime());
        if (vr === VR.TM) return parseTM(this.bytes);
        return [];
    }

    toDateTimes(vr, zone) {
        vr = vr === undefined ? VR.DT : vr;
        zone = zone === undefined ? base.systemZone : zone;
        if (vr === VR.DA) return parseDA(this.bytes).map(da => da.atStartOfDay(zone));
        if (vr === VR.DT) return parseDT(this.bytes, zone);
        return [];
    }

    toString(vr, bigEndian, characterSets) { return Value._headOption(this.toStrings(vr, bigEndian, characterSets)); }
    toNumber(vr, bigEndian) { return Value._headOption(this.toNumbers(vr, bigEndian)); }
    toDate(vr) { return Value._headOption(this.toDates(vr)); }
    toTime(vr) { return Value._headOption(this.toTimes(vr)); }
    toDateTime(vr, zone) { return Value._headOption(this.toDateTimes(vr, zone)); }

    append(bytes) {
        return new Value(base.concat(this.bytes, bytes));
    }

    ensurePadding(vr) {
        return Value.fromBuffer(vr, this.bytes);
    }
}

const trimPadding = function(s, paddingByte) {
    let index = s.length;
    while (index > 0 && s.charCodeAt(index - 1) <= paddingByte) index -= 1;
    return s.substring(0, index);
};

const combine = function(values, vr) {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL || vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD)
        return values.reduce(base.concat, base.emptyBuffer);
    let delim = Buffer.from("\\");
    return values.reduce((prev, curr) => base.concatv(prev, delim, curr));
};

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

const numberBytes = function(vr, value, bigEndian) {
    if (vr === VR.AT) return base.tagToBytes(value, bigEndian);
    if (vr === VR.FL) return base.floatToBytes(value, bigEndian);
    if (vr === VR.FD) return base.doubleToBytes(value, bigEndian);
    if (vr === VR.SL) return base.intToBytes(value, bigEndian);
    if (vr === VR.SS) return base.shortToBytes(value, bigEndian);
    if (vr === VR.UL) return base.intToBytes(value, bigEndian);
    if (vr === VR.US) return base.shortToBytes(value, bigEndian);
    if (vr === VR.AT) return base.tagToBytes(value, bigEndian);
    if (vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD)
        throw Error("Cannot create value of VR " + vr + " from int");
    return Buffer.from(value + "")
};

const dateBytes = function(vr, value) {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD)
        throw Error("Cannot create value of VR " + vr + " from date");
    return Buffer.from(formatDate(value));
};

const timeBytes = function(vr, value) {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD)
        throw Error("Cannot create value of VR " + vr + " from time");
    return Buffer.from(formatTime(value));
};

const dateTimeBytes = function(vr, value) {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD)
        throw Error("Cannot create value of VR " + vr + " from date-time");
    return Buffer.from(formatDateTime(value));
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
const parseSS = function(value, bigEndian) { return splitFixed(value, 2).map(b => base.bytesToShort(b, bigEndian)); };
const parseUL = function(value, bigEndian) { return splitFixed(value, 4).map(b => base.bytesToUInt(b, bigEndian)); };
const parseUS = function(value, bigEndian) { return splitFixed(value, 2).map(b => base.bytesToUShort(b, bigEndian)); };
const parseFL = function(value, bigEndian) { return splitFixed(value, 4).map(b => base.bytesToFloat(b, bigEndian)); };
const parseFD = function(value, bigEndian) { return splitFixed(value, 8).map(b => base.bytesToDouble(b, bigEndian)); };
const parseDS = function(value) { return splitString(value.toString()).map(base.trim).map(s => parseFloat(s)); };
const parseIS = function(value) { return splitString(value.toString()).map(base.trim).map(s => parseInt(s)); };
const parseDA = function(value) { return splitString(value.toString()).map(parseDate).filter(d => d !== undefined); };
const parseTM = function(value) { return splitString(value.toString()).map(parseTime).filter(d => d !== undefined); };
const parseDT = function(value, zone) { return splitString(value.toString()).map(s => parseDateTime(s, zone)).filter(d => d !== undefined); };

const dateFormat1 = joda.DateTimeFormatter.ofPattern("uuuuMMdd");
const dateFormat2 = joda.DateTimeFormatter.ofPattern("uuuu'.'MM'.'dd");
const timeFormat = new joda.DateTimeFormatterBuilder()
    .appendPattern("HH[[':']mm[[':']ss[")
    .appendFraction(joda.ChronoField.MICRO_OF_SECOND, 1, 6, true)
    .appendPattern("]]]")
    .toFormatter(joda.ResolverStyle.LENIENT);
const timeFormatForEncoding = joda.DateTimeFormatter.ofPattern("HHmmss'.'SSSSSS");
const dateTimeFormatForEncoding = joda.DateTimeFormatter.ofPattern("uuuuMMddHHmmss'.'SSSSSSZ");

const formatDate = function(date) { return date.format(dateFormat1); };
const formatTime = function(time) { return time.format(timeFormatForEncoding); };
const formatDateTime = function(dateTime) { return dateTime.format(dateTimeFormatForEncoding); };

const parseDate = function(s) {
    let trimmed = s.trim();
    try { return joda.LocalDate.parse(trimmed, dateFormat1); } catch (error) {
        try { return joda.LocalDate.parse(trimmed, dateFormat2); } catch (error) { return undefined; }
    }
};

const parseTime = function(s) {
    try { return joda.LocalTime.parse(s.trim(), timeFormat); } catch (error) { return undefined; }
};

const parseDateTime = function(s, zone) {
    s = s.trim();
    let len = s.length;
    let zoneStart = Math.max(s.indexOf("+"), s.indexOf("-"));
    if (zoneStart >= 0)
        len -= 5;
    if (!(len === 4 || len === 6 || len === 8 || len === 10 || len === 12 || len === 14 || len === 21))
        return undefined;
    try {
        let year = parseInt(s.substring(0, 4));
        let month = 1, dayOfMonth = 1, hour = 0, minute = 0, second = 0, nanoOfSecond = 0, zone = base.systemZone;
        if (len >= 6) {
            month = parseInt(s.substring(4, 6));
            if (len >= 8) {
                dayOfMonth = parseInt(s.substring(6, 8));
                if (len >= 10) {
                    hour = parseInt(s.substring(8, 10));
                    if (len >= 12) {
                        minute = parseInt(s.substring(10, 12));
                        if (len >= 14) {
                            second = parseInt(s.substring(12, 14));
                            if (s.charAt(14) === "." && len >= 21)
                                nanoOfSecond = parseInt(s.substring(15, 21)) * 1000;
                        }
                    }
                }
            }
        }
        let zoneStart = Math.max(s.indexOf("+"), s.indexOf("-"));
        if (zoneStart >= 4) {
            zone = joda.ZoneOffset.ofHoursMinutes(parseInt(s.substring(zoneStart + 1, zoneStart + 3)), parseInt(s.substring(zoneStart + 3, zoneStart + 5)));
        }
        return joda.ZonedDateTime.of(year, month, dayOfMonth, hour, minute, second, nanoOfSecond, zone);
    } catch (error) {
        return undefined;
    }
};

module.exports = {
    Value: Value
};
