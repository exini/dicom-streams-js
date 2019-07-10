import {
    ChronoField, DateTimeFormatter, DateTimeFormatterBuilder, LocalDate,
    LocalTime, ResolverStyle, ZonedDateTime, ZoneId, ZoneOffset } from "js-joda";
import {
    bytesToDouble, bytesToFloat, bytesToInt, bytesToShort, bytesToTag, bytesToUInt, bytesToUShort, concat, concatv,
    doubleToBytes, emptyBuffer, floatToBytes, intToBytes, multiValueDelimiter, padToEvenLength, shortToBytes,
    systemZone, tagToBytes, tagToString, trim,
} from "./base";
import { CharacterSets, defaultCharacterSet } from "./character-sets";
import {VR} from "./vr";

export class Value {
    public static fromString(vr: VR, value: string, bigEndian: boolean = false): Value {
        return create(stringBytes(vr, value, bigEndian), vr);
    }

    public static fromStrings(vr: VR, values: string[], bigEndian: boolean = false): Value {
        return create(combine(values.map((v) => stringBytes(vr, v, bigEndian)), vr), vr);
    }

    public static fromBuffer(vr: VR, buffer: Buffer): Value { return create(buffer, vr); }

    public static fromBytes(vr: VR, bytes: number[]) { return Value.fromBuffer(vr, Buffer.from(bytes)); }

    public static fromNumber(vr: VR, value: number, bigEndian: boolean = false): Value {
        return create(numberBytes(vr, value, bigEndian), vr);
    }
    public static fromNumbers(vr: VR, values: number[], bigEndian: boolean = false): Value {
        return create(combine(values.map((v) => numberBytes(vr, v, bigEndian)), vr), vr);
    }

    public static fromDate(vr: VR, value: LocalDate): Value { return create(dateBytes(vr, value), vr); }
    public static fromDates(vr: VR, values: LocalDate[]): Value {
        return create(combine(values.map((v) => dateBytes(vr, v)), vr), vr);
    }

    public static fromTime(vr: VR, value: LocalTime): Value { return create(timeBytes(vr, value), vr); }
    public static fromTimes(vr: VR, values: LocalTime[]): Value {
        return create(combine(values.map((v) => timeBytes(vr, v)), vr), vr);
    }

    public static fromDateTime(vr: VR, value: ZonedDateTime): Value { return create(dateTimeBytes(vr, value), vr); }
    public static fromDateTimes(vr: VR, values: ZonedDateTime[]): Value {
        return create(combine(values.map((v) => dateTimeBytes(vr, v)), vr), vr);
    }

    public static empty() { return new Value(emptyBuffer); }

    private static headOption<T>(array: T[]): T { return array.length > 0 ? array[0] : undefined; }

    public length: number;

    constructor(public readonly bytes: Buffer) {
        this.length = bytes.length;
    }

    public toStrings(
        vr: VR,
        bigEndian: boolean = false,
        characterSets: CharacterSets = defaultCharacterSet): string[] {
        if (this.length === 0) { return []; }
        if (vr === VR.AT) { return parseAT(this.bytes, bigEndian).map(tagToString); }
        if (vr === VR.FL) { return parseFL(this.bytes, bigEndian).map((v) => v.toString()); }
        if (vr === VR.FD) { return parseFD(this.bytes, bigEndian).map((v) => v.toString()); }
        if (vr === VR.SL) { return parseSL(this.bytes, bigEndian).map((v) => v.toString()); }
        if (vr === VR.SS) { return parseSS(this.bytes, bigEndian).map((v) => v.toString()); }
        if (vr === VR.UL) { return parseUL(this.bytes, bigEndian).map((v) => v.toString()); }
        if (vr === VR.US) { return parseUS(this.bytes, bigEndian).map((v) => v.toString()); }
        if (vr === VR.OB) { return [this.bytes.length + " bytes"]; }
        if (vr === VR.OW) { return [this.bytes.length / 2 + " words"]; }
        if (vr === VR.OF) { return [parseFL(this.bytes, bigEndian).join(" ")]; }
        if (vr === VR.OD) { return [parseFD(this.bytes, bigEndian).join(" ")]; }
        if (vr === VR.ST || vr === VR.LT || vr === VR.UT || vr === VR.UR) {
            return [trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte)];
        }
        if (vr === VR.DA || vr === VR.TM || vr === VR.DT) { return splitString(this.bytes.toString()).map(trim); }
        if (vr === VR.UC)  { return splitString(trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte)); }
        return splitString(characterSets.decode(this.bytes, vr)).map(trim);
    }

    public toSingleString(
        vr: VR,
        bigEndian: boolean = false,
        characterSets: CharacterSets = defaultCharacterSet): string {
        if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
            vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OF || vr === VR.OD) {
            const strings = this.toStrings(vr, bigEndian, characterSets);
            return strings.length === 0 ? "" : strings.join(multiValueDelimiter);
        }
        if (vr === VR.ST || vr === VR.LT || vr === VR.UT || vr === VR.UR) {
            return trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte);
        }
        if (vr === VR.DA || vr === VR.TM || vr === VR.DT) { return trim(this.bytes.toString()); }
        if (vr === VR.UC) {
            return trimPadding(characterSets.decode(this.bytes, vr), vr.paddingByte);
        }
        return trim(characterSets.decode(this.bytes, vr));
    }

    public toNumbers(vr: VR, bigEndian: boolean = false): number[] {
        if (this.length === 0) { return []; }
        if (vr === VR.AT) { return parseAT(this.bytes, bigEndian); }
        if (vr === VR.DS) { return parseDS(this.bytes).filter((n) => !isNaN(n)); }
        if (vr === VR.FL) { return parseFL(this.bytes, bigEndian); }
        if (vr === VR.FD) { return parseFD(this.bytes, bigEndian); }
        if (vr === VR.IS) { return parseIS(this.bytes).filter((n) => !isNaN(n)); }
        if (vr === VR.SL) { return parseSL(this.bytes, bigEndian); }
        if (vr === VR.SS) { return parseSS(this.bytes, bigEndian); }
        if (vr === VR.UL) { return parseUL(this.bytes, bigEndian); }
        if (vr === VR.US) { return parseUS(this.bytes, bigEndian); }
        return [];
    }

    public toDates(vr: VR = VR.DA): LocalDate[] {
        if (vr === VR.DA) { return parseDA(this.bytes); }
        if (vr === VR.DT) { return parseDT(this.bytes, systemZone).map((dt) => dt.toLocalDate()); }
        return [];
    }

    public toTimes(vr: VR = VR.TM): LocalTime[] {
        if (vr === VR.DT) { return parseDT(this.bytes, systemZone).map((dt) => dt.toLocalTime()); }
        if (vr === VR.TM) { return parseTM(this.bytes); }
        return [];
    }

    public toDateTimes(vr: VR = VR.DT, zone: ZoneId = systemZone): ZonedDateTime[] {
        if (vr === VR.DA) { return parseDA(this.bytes).map((da) => da.atStartOfDay(zone)); }
        if (vr === VR.DT) { return parseDT(this.bytes, zone); }
        return [];
    }

    public toString(
        vr: VR,
        bigEndian: boolean = false,
        characterSets: CharacterSets = defaultCharacterSet): string {
        return Value.headOption(this.toStrings(vr, bigEndian, characterSets));
    }
    public toNumber(
        vr: VR,
        bigEndian: boolean = false): number {
            return Value.headOption(this.toNumbers(vr, bigEndian));
    }
    public toDate(vr?: VR): LocalDate { return Value.headOption(this.toDates(vr)); }
    public toTime(vr?: VR): LocalTime { return Value.headOption(this.toTimes(vr)); }
    public toDateTime(vr?: VR, zone?: ZoneId): ZonedDateTime { return Value.headOption(this.toDateTimes(vr, zone)); }

    public append(bytes: Buffer): Value {
        return new Value(concat(this.bytes, bytes));
    }

    public ensurePadding(vr: VR): Value {
        return Value.fromBuffer(vr, this.bytes);
    }
}

function trimPadding(s: string, paddingByte: number): string {
    let index = s.length;
    while (index > 0 && s.charCodeAt(index - 1) <= paddingByte) { index -= 1; }
    return s.substring(0, index);
}

function combine(values: Buffer[], vr: VR): Buffer {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        return values.reduce(concat, emptyBuffer);
    }
    const delim = Buffer.from("\\");
    return values.reduce((prev, curr) => concatv(prev, delim, curr));
}

function create(bytes: Buffer, vr?: VR): Value {
    return vr ? new Value(padToEvenLength(bytes, vr)) : new Value(bytes);
}

function stringBytes(vr: VR, value: string, bigEndian: boolean = false): Buffer {
    if (vr === VR.AT) { return tagToBytes(parseInt(value, 16), bigEndian); }
    if (vr === VR.FL) { return floatToBytes(parseFloat(value), bigEndian); }
    if (vr === VR.FD) { return doubleToBytes(parseFloat(value), bigEndian); }
    if (vr === VR.SL) { return intToBytes(parseInt(value, 10), bigEndian); }
    if (vr === VR.SS) { return shortToBytes(parseInt(value, 10), bigEndian); }
    if (vr === VR.UL) { return intToBytes(parseInt(value, 10), bigEndian); }
    if (vr === VR.US) { return shortToBytes(parseInt(value, 10), bigEndian); }
    if (vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error("Cannot create binary array from string");
    }
    return Buffer.from(value);
}

function numberBytes(vr: VR, value: number, bigEndian: boolean = false): Buffer {
    if (vr === VR.AT) { return tagToBytes(value, bigEndian); }
    if (vr === VR.FL) { return floatToBytes(value, bigEndian); }
    if (vr === VR.FD) { return doubleToBytes(value, bigEndian); }
    if (vr === VR.SL) { return intToBytes(value, bigEndian); }
    if (vr === VR.SS) { return shortToBytes(value, bigEndian); }
    if (vr === VR.UL) { return intToBytes(value, bigEndian); }
    if (vr === VR.US) { return shortToBytes(value, bigEndian); }
    if (vr === VR.AT) { return tagToBytes(value, bigEndian); }
    if (vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error("Cannot create value of VR " + vr + " from int");
    }
    return Buffer.from(value + "");
}

function dateBytes(vr: VR, value: LocalDate): Buffer {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error("Cannot create value of VR " + vr + " from date");
    }
    return Buffer.from(formatDate(value));
}

function timeBytes(vr: VR, value: LocalTime): Buffer {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error("Cannot create value of VR " + vr + " from time");
    }
    return Buffer.from(formatTime(value));
}

function dateTimeBytes(vr: VR, value: ZonedDateTime): Buffer {
    if (vr === VR.AT || vr === VR.FL || vr === VR.FD || vr === VR.SL || vr === VR.SS || vr === VR.UL ||
        vr === VR.US || vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error("Cannot create value of VR " + vr + " from date-time");
    }
    return Buffer.from(formatDateTime(value));
}

function chunk(arr: Buffer, len: number): Buffer[] {
    const chunks = [];
    const n = arr.length;
    let i = 0;
    while (i < n) {
        chunks.push(arr.slice(i, i += len));
    }
    return chunks;
}

function splitFixed(bytes: Buffer, size: number): Buffer[] {
    return chunk(bytes, size).filter((g) => g.length === size);
}
function splitString(s: string): string[] { return s.split(multiValueDelimiter); }

function parseAT(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToTag(b, bigEndian));
}
function parseSL(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToInt(b, bigEndian));
}
function parseSS(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 2).map((b) => bytesToShort(b, bigEndian));
}
function parseUL(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToUInt(b, bigEndian));
}
function parseUS(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 2).map((b) => bytesToUShort(b, bigEndian));
}
function parseFL(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToFloat(b, bigEndian));
}
function parseFD(value: Buffer, bigEndian: boolean = false): number[] {
    return splitFixed(value, 8).map((b) => bytesToDouble(b, bigEndian));
}
function parseDS(value: Buffer): number[] {
    return splitString(value.toString()).map(trim).map((s) => parseFloat(s));
}
function parseIS(value: Buffer): number[] {
    return splitString(value.toString()).map(trim).map((s) => parseInt(s, 10));
}
function parseDA(value: Buffer): LocalDate[] {
    return splitString(value.toString()).map(parseDate).filter((d) => d !== undefined);
}
function parseTM(value: Buffer): LocalTime[] {
    return splitString(value.toString()).map(parseTime).filter((d) => d !== undefined);
}
function parseDT(value: Buffer, zone: ZoneId): ZonedDateTime[] {
    return splitString(value.toString()).map((s) => parseDateTime(s, zone)).filter((d) => d !== undefined);
}

const dateFormat1 = DateTimeFormatter.ofPattern("uuuuMMdd");
const dateFormat2 = DateTimeFormatter.ofPattern("uuuu'.'MM'.'dd");
const timeFormat = new DateTimeFormatterBuilder()
    .appendPattern("HH[[':']mm[[':']ss[")
    .appendFraction(ChronoField.MICRO_OF_SECOND, 1, 6, true)
    .appendPattern("]]]")
    .toFormatter(ResolverStyle.LENIENT);
const timeFormatForEncoding = DateTimeFormatter.ofPattern("HHmmss'.'SSSSSS");
const dateTimeFormatForEncoding = DateTimeFormatter.ofPattern("uuuuMMddHHmmss'.'SSSSSSZ");

function formatDate(date: LocalDate): string { return date.format(dateFormat1); }
function formatTime(time: LocalTime): string { return time.format(timeFormatForEncoding); }
function formatDateTime(dateTime: ZonedDateTime): string { return dateTime.format(dateTimeFormatForEncoding); }

function parseDate(s: string): LocalDate {
    const trimmed = s.trim();
    try { return LocalDate.parse(trimmed, dateFormat1); } catch (error) {
        try { return LocalDate.parse(trimmed, dateFormat2); } catch (error) { return undefined; }
    }
}

function parseTime(s: string): LocalTime {
    try { return LocalTime.parse(s.trim(), timeFormat); } catch (error) { return undefined; }
}

function parseDateTime(s: string, zone: ZoneId = systemZone): ZonedDateTime {
    s = s.trim();
    let len = s.length;
    let zoneStart = Math.max(s.indexOf("+"), s.indexOf("-"));
    if (zoneStart >= 0) {
        len -= 5;
    }
    if (!(len === 4 || len === 6 || len === 8 || len === 10 || len === 12 || len === 14 || len === 21)) {
        return undefined;
    }
    try {
        const year = parseInt(s.substring(0, 4), 10);
        let month = 1;
        let dayOfMonth = 1;
        let hour = 0;
        let minute = 0;
        let second = 0;
        let nanoOfSecond = 0;
        if (len >= 6) {
            month = parseInt(s.substring(4, 6), 10);
            if (len >= 8) {
                dayOfMonth = parseInt(s.substring(6, 8), 10);
                if (len >= 10) {
                    hour = parseInt(s.substring(8, 10), 10);
                    if (len >= 12) {
                        minute = parseInt(s.substring(10, 12), 10);
                        if (len >= 14) {
                            second = parseInt(s.substring(12, 14), 10);
                            if (s.charAt(14) === "." && len >= 21) {
                                nanoOfSecond = parseInt(s.substring(15, 21), 10) * 1000;
                            }
                        }
                    }
                }
            }
        }
        zoneStart = Math.max(s.indexOf("+"), s.indexOf("-"));
        if (zoneStart >= 4) {
            zone = ZoneOffset.ofHoursMinutes(
                parseInt(s.substring(zoneStart + 1, zoneStart + 3), 10),
                parseInt(s.substring(zoneStart + 3, zoneStart + 5), 10));
        }
        return ZonedDateTime.of(year, month, dayOfMonth, hour, minute, second, nanoOfSecond, zone);
    } catch (error) {
        return undefined;
    }
}
