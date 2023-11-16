import {
    ChronoField,
    DateTimeFormatter,
    DateTimeFormatterBuilder,
    LocalDate,
    LocalTime,
    ResolverStyle,
    ZonedDateTime,
    ZoneId,
    ZoneOffset,
} from 'js-joda';
import {
    bytesToDouble,
    bytesToFloat,
    bytesToInt,
    bytesToShort,
    bytesToTag,
    bytesToUInt,
    bytesToUShort,
    concat,
    concatv,
    doubleToBytes,
    emptyBuffer,
    floatToBytes,
    intToBytes,
    multiValueDelimiter,
    padToEvenLength,
    shortToBytes,
    systemZone,
    tagToBytes,
    tagToString,
    trim,
} from './base';
import { CharacterSets, defaultCharacterSet } from './character-sets';
import { VR } from './vr';
import { PersonName, ComponentGroup } from './person-name';

export class Value {
    public static fromString(vr: VR, value: string, bigEndian = false): Value {
        return create(stringBytes(vr, value, bigEndian), vr);
    }

    public static fromStrings(vr: VR, values: string[], bigEndian = false): Value {
        return create(
            combine(
                values.map((v) => stringBytes(vr, v, bigEndian)),
                vr,
            ),
            vr,
        );
    }

    public static fromBuffer(vr: VR, buffer: Buffer): Value {
        return create(buffer, vr);
    }

    public static fromBytes(vr: VR, bytes: number[]): Value {
        return Value.fromBuffer(vr, Buffer.from(bytes));
    }

    public static fromNumber(vr: VR, value: number, bigEndian = false): Value {
        return create(numberBytes(vr, value, bigEndian), vr);
    }
    public static fromNumbers(vr: VR, values: number[], bigEndian = false): Value {
        return create(
            combine(
                values.map((v) => numberBytes(vr, v, bigEndian)),
                vr,
            ),
            vr,
        );
    }

    public static fromDate(vr: VR, value: LocalDate): Value {
        return create(dateBytes(vr, value), vr);
    }
    public static fromDates(vr: VR, values: LocalDate[]): Value {
        return create(
            combine(
                values.map((v) => dateBytes(vr, v)),
                vr,
            ),
            vr,
        );
    }

    public static fromTime(vr: VR, value: LocalTime): Value {
        return create(timeBytes(vr, value), vr);
    }
    public static fromTimes(vr: VR, values: LocalTime[]): Value {
        return create(
            combine(
                values.map((v) => timeBytes(vr, v)),
                vr,
            ),
            vr,
        );
    }

    public static fromDateTime(vr: VR, value: ZonedDateTime): Value {
        return create(dateTimeBytes(vr, value), vr);
    }
    public static fromDateTimes(vr: VR, values: ZonedDateTime[]): Value {
        return create(
            combine(
                values.map((v) => dateTimeBytes(vr, v)),
                vr,
            ),
            vr,
        );
    }

    public static fromPersonName(vr: VR, value: PersonName): Value {
        return Value.fromBuffer(vr, personNameBytes(vr, value));
    }
    public static fromPersonNames(vr: VR, values: PersonName[]): Value {
        return Value.fromBuffer(
            vr,
            combine(
                values.map((v) => personNameBytes(vr, v)),
                vr,
            ),
        );
    }

    public static fromURL(vr: VR, value: URL): Value {
        return create(urlBytes(vr, value), vr);
    }

    public static empty(): Value {
        return new Value(emptyBuffer);
    }

    private static headOption<T>(array: T[]): T {
        return array.length > 0 ? array[0] : undefined;
    }

    public length: number;

    constructor(public readonly bytes: Buffer) {
        this.length = bytes.length;
    }

    public toStrings(vr: VR, bigEndian = false, characterSets: CharacterSets = defaultCharacterSet): string[] {
        if (this.length === 0) {
            return [];
        }
        if (vr === VR.AT) {
            return parseAT(this.bytes, bigEndian).map(tagToString);
        }
        if (vr === VR.FL) {
            return parseFL(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.FD) {
            return parseFD(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.SS) {
            return parseSS(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.SL) {
            return parseSL(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.SV) {
            return parseSV(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.US) {
            return parseUS(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.UL) {
            return parseUL(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.UV) {
            return parseSV(this.bytes, bigEndian).map((v) => v.toString());
        }
        if (vr === VR.OB) {
            return [this.bytes.length + ' bytes'];
        }
        if (vr === VR.OW) {
            return [this.bytes.length / 2 + ' words'];
        }
        if (vr === VR.OL) {
            return [this.bytes.length / 4 + ' longs'];
        }
        if (vr === VR.OV) {
            return [this.bytes.length / 8 + ' very longs'];
        }
        if (vr === VR.OF) {
            return [this.bytes.length / 4 + ' floats'];
        }
        if (vr === VR.OD) {
            return [this.bytes.length / 8 + ' doubles'];
        }
        if (vr === VR.ST || vr === VR.LT || vr === VR.UT) {
            return [trimTrailing(characterSets.decode(this.bytes, vr), vr.paddingByte)];
        }
        if (vr === VR.LO || vr === VR.SH || vr === VR.UC) {
            return splitString(characterSets.decode(this.bytes, vr));
        }
        if (vr == VR.PN) {
            return splitString(characterSets.decode(this.bytes, vr)).map(trim);
        }
        return splitString(this.bytes.toString()).map(trim);
    }

    public toSingleString(vr: VR, bigEndian = false, characterSets = defaultCharacterSet): string {
        const strings = this.toStrings(vr, bigEndian, characterSets);
        return strings.length === 0 ? '' : strings.join(multiValueDelimiter);
    }

    public toNumbers(vr: VR, bigEndian = false): number[] {
        if (this.length === 0) {
            return [];
        }
        if (vr === VR.AT) {
            return parseAT(this.bytes, bigEndian);
        }
        if (vr === VR.DS) {
            return parseDS(this.bytes).filter((n) => !isNaN(n));
        }
        if (vr === VR.FL) {
            return parseFL(this.bytes, bigEndian);
        }
        if (vr === VR.FD) {
            return parseFD(this.bytes, bigEndian);
        }
        if (vr === VR.IS) {
            return parseIS(this.bytes).filter((n) => !isNaN(n));
        }
        if (vr === VR.SL) {
            return parseSL(this.bytes, bigEndian);
        }
        if (vr === VR.SS) {
            return parseSS(this.bytes, bigEndian);
        }
        if (vr === VR.UL) {
            return parseUL(this.bytes, bigEndian);
        }
        if (vr === VR.US) {
            return parseUS(this.bytes, bigEndian);
        }
        return [];
    }

    public toDates(vr: VR = VR.DA): LocalDate[] {
        if (vr === VR.DA) {
            return parseDA(this.bytes);
        }
        if (vr === VR.DT) {
            return parseDT(this.bytes, systemZone).map((dt) => dt.toLocalDate());
        }
        return [];
    }

    public toTimes(vr: VR = VR.TM): LocalTime[] {
        if (vr === VR.DT) {
            return parseDT(this.bytes, systemZone).map((dt) => dt.toLocalTime());
        }
        if (vr === VR.TM) {
            return parseTM(this.bytes);
        }
        return [];
    }

    public toDateTimes(vr: VR = VR.DT, zone: ZoneId = systemZone): ZonedDateTime[] {
        if (vr === VR.DA) {
            return parseDA(this.bytes).map((da) => da.atStartOfDay(zone));
        }
        if (vr === VR.DT) {
            return parseDT(this.bytes, zone);
        }
        return [];
    }

    public toPersonNames(vr: VR = VR.PN, characterSets: CharacterSets = defaultCharacterSet): PersonName[] {
        if (vr === VR.PN) {
            return parsePN(this.bytes, characterSets);
        }
        return [];
    }

    public toURL(vr: VR = VR.UR): URL {
        if (vr === VR.UR) {
            return parseUR(this.bytes);
        }
        return undefined;
    }

    public toString(vr: VR, bigEndian = false, characterSets: CharacterSets = defaultCharacterSet): string {
        return Value.headOption(this.toStrings(vr, bigEndian, characterSets));
    }
    public toNumber(vr: VR, bigEndian = false): number {
        return Value.headOption(this.toNumbers(vr, bigEndian));
    }
    public toDate(vr?: VR): LocalDate {
        return Value.headOption(this.toDates(vr));
    }
    public toTime(vr?: VR): LocalTime {
        return Value.headOption(this.toTimes(vr));
    }
    public toDateTime(vr?: VR, zone?: ZoneId): ZonedDateTime {
        return Value.headOption(this.toDateTimes(vr, zone));
    }

    public toPersonName(vr: VR = VR.PN, characterSets: CharacterSets = defaultCharacterSet): PersonName {
        return Value.headOption(this.toPersonNames(vr, characterSets));
    }

    public append(bytes: Buffer): Value {
        return new Value(concat(this.bytes, bytes));
    }

    public ensurePadding(vr: VR): Value {
        return Value.fromBuffer(vr, this.bytes);
    }
}

function trimTrailing(s: string, paddingByte: number): string {
    let index = s.length;
    while (index > 0 && s.charCodeAt(index - 1) <= paddingByte) {
        index -= 1;
    }
    return s.substring(0, index);
}

function combine(values: Buffer[], vr: VR): Buffer {
    if (
        vr === VR.AT ||
        vr === VR.FL ||
        vr === VR.FD ||
        vr === VR.SL ||
        vr === VR.SS ||
        vr === VR.UL ||
        vr === VR.US ||
        vr === VR.OB ||
        vr === VR.OW ||
        vr === VR.OL ||
        vr === VR.OF ||
        vr === VR.OD
    ) {
        return values.reduce(concat, emptyBuffer);
    }
    const delim = Buffer.from('\\');
    return values.reduce((prev, curr) => concatv(prev, delim, curr));
}

function create(bytes: Buffer, vr?: VR): Value {
    return vr ? new Value(padToEvenLength(bytes, vr)) : new Value(bytes);
}

function stringBytes(vr: VR, value: string, bigEndian = false): Buffer {
    if (vr === VR.AT) {
        return tagToBytes(parseInt(value, 16), bigEndian);
    }
    if (vr === VR.FL) {
        return floatToBytes(parseFloat(value), bigEndian);
    }
    if (vr === VR.FD) {
        return doubleToBytes(parseFloat(value), bigEndian);
    }
    if (vr === VR.SL) {
        return intToBytes(parseInt(value, 10), bigEndian);
    }
    if (vr === VR.SS) {
        return shortToBytes(parseInt(value, 10), bigEndian);
    }
    if (vr === VR.UL) {
        return intToBytes(parseInt(value, 10), bigEndian);
    }
    if (vr === VR.US) {
        return shortToBytes(parseInt(value, 10), bigEndian);
    }
    if (vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error('Cannot create binary array from string');
    }
    return Buffer.from(value);
}

function numberBytes(vr: VR, value: number, bigEndian = false): Buffer {
    if (vr === VR.AT) {
        return tagToBytes(value, bigEndian);
    }
    if (vr === VR.FL) {
        return floatToBytes(value, bigEndian);
    }
    if (vr === VR.FD) {
        return doubleToBytes(value, bigEndian);
    }
    if (vr === VR.SL) {
        return intToBytes(value, bigEndian);
    }
    if (vr === VR.SS) {
        return shortToBytes(value, bigEndian);
    }
    if (vr === VR.UL) {
        return intToBytes(value, bigEndian);
    }
    if (vr === VR.US) {
        return shortToBytes(value, bigEndian);
    }
    if (vr === VR.AT) {
        return tagToBytes(value, bigEndian);
    }
    if (vr === VR.OB || vr === VR.OW || vr === VR.OL || vr === VR.OF || vr === VR.OD) {
        throw Error('Cannot create value of VR ' + vr + ' from int');
    }
    return Buffer.from(value + '');
}

function dateBytes(vr: VR, value: LocalDate): Buffer {
    if (
        vr === VR.AT ||
        vr === VR.FL ||
        vr === VR.FD ||
        vr === VR.SL ||
        vr === VR.SS ||
        vr === VR.UL ||
        vr === VR.US ||
        vr === VR.OB ||
        vr === VR.OW ||
        vr === VR.OL ||
        vr === VR.OF ||
        vr === VR.OD
    ) {
        throw Error('Cannot create value of VR ' + vr + ' from date');
    }
    return Buffer.from(formatDate(value));
}

function timeBytes(vr: VR, value: LocalTime): Buffer {
    if (
        vr === VR.AT ||
        vr === VR.FL ||
        vr === VR.FD ||
        vr === VR.SL ||
        vr === VR.SS ||
        vr === VR.UL ||
        vr === VR.US ||
        vr === VR.OB ||
        vr === VR.OW ||
        vr === VR.OL ||
        vr === VR.OF ||
        vr === VR.OD
    ) {
        throw Error('Cannot create value of VR ' + vr + ' from time');
    }
    return Buffer.from(formatTime(value));
}

function dateTimeBytes(vr: VR, value: ZonedDateTime): Buffer {
    if (
        vr === VR.AT ||
        vr === VR.FL ||
        vr === VR.FD ||
        vr === VR.SL ||
        vr === VR.SS ||
        vr === VR.UL ||
        vr === VR.US ||
        vr === VR.OB ||
        vr === VR.OW ||
        vr === VR.OL ||
        vr === VR.OF ||
        vr === VR.OD
    ) {
        throw Error('Cannot create value of VR ' + vr + ' from date-time');
    }
    return Buffer.from(formatDateTime(value));
}

function personNameBytes(vr: VR, value: PersonName): Buffer {
    if (vr === VR.PN) {
        return Buffer.from(value.toString());
    }
    throw Error('Cannot create value of VR ' + vr + ' from person name');
}

function urlBytes(vr: VR, value: URL): Buffer {
    if (vr === VR.UR) {
        return Buffer.from(value.toString());
    }
    throw Error('Cannot create value of VR ' + vr + ' from URL');
}

function chunk(arr: Buffer, len: number): Buffer[] {
    const chunks = [];
    const n = arr.length;
    let i = 0;
    while (i < n) {
        chunks.push(arr.slice(i, (i += len)));
    }
    return chunks;
}

function splitFixed(bytes: Buffer, size: number): Buffer[] {
    return chunk(bytes, size).filter((g) => g.length === size);
}
function splitString(s: string): string[] {
    return s.split(multiValueDelimiter);
}

function parseAT(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToTag(b, bigEndian));
}
function parseSL(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToInt(b, bigEndian));
}
function parseSV(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 8).map((b) => bytesToFloat(b, bigEndian));
}
function parseSS(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 2).map((b) => bytesToShort(b, bigEndian));
}
function parseUL(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToUInt(b, bigEndian));
}
function parseUS(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 2).map((b) => bytesToUShort(b, bigEndian));
}
function parseFL(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 4).map((b) => bytesToFloat(b, bigEndian));
}
function parseFD(value: Buffer, bigEndian = false): number[] {
    return splitFixed(value, 8).map((b) => bytesToDouble(b, bigEndian));
}
function parseDS(value: Buffer): number[] {
    return splitString(value.toString())
        .map(trim)
        .map((s) => parseFloat(s));
}
function parseIS(value: Buffer): number[] {
    return splitString(value.toString())
        .map(trim)
        .map((s) => parseInt(s, 10));
}
function parseDA(value: Buffer): LocalDate[] {
    return splitString(value.toString())
        .map(parseDate)
        .filter((d) => d !== undefined);
}
function parseTM(value: Buffer): LocalTime[] {
    return splitString(value.toString())
        .map(parseTime)
        .filter((d) => d !== undefined);
}
function parseDT(value: Buffer, zone: ZoneId): ZonedDateTime[] {
    return splitString(value.toString())
        .map((s) => parseDateTime(s, zone))
        .filter((d) => d !== undefined);
}
function parsePN(value: Buffer, characterSets: CharacterSets): PersonName[] {
    return splitString(characterSets.decode(value, VR.PN))
        .map(trim)
        .map((s) => parsePersonName(s));
}
function parseUR(value: Buffer): URL {
    return parseURL(value.toString().trim());
}

const dateFormat1 = DateTimeFormatter.ofPattern('uuuuMMdd');
const dateFormat2 = DateTimeFormatter.ofPattern("uuuu'.'MM'.'dd");
const timeFormat = new DateTimeFormatterBuilder()
    .appendPattern("HH[[':']mm[[':']ss[")
    .appendFraction(ChronoField.MICRO_OF_SECOND, 1, 6, true)
    .appendPattern(']]]')
    .toFormatter(ResolverStyle.LENIENT);
const timeFormatForEncoding = DateTimeFormatter.ofPattern("HHmmss'.'SSSSSS");
const dateTimeFormatForEncoding = DateTimeFormatter.ofPattern("uuuuMMddHHmmss'.'SSSSSSZ");

function formatDate(date: LocalDate): string {
    return date.format(dateFormat1);
}
function formatTime(time: LocalTime): string {
    return time.format(timeFormatForEncoding);
}
function formatDateTime(dateTime: ZonedDateTime): string {
    return dateTime.format(dateTimeFormatForEncoding);
}

function parseDate(s: string): LocalDate {
    const trimmed = s.trim();
    try {
        return LocalDate.parse(trimmed, dateFormat1);
    } catch (error) {
        try {
            return LocalDate.parse(trimmed, dateFormat2);
        } catch (error) {
            return undefined;
        }
    }
}

function parseTime(s: string): LocalTime {
    try {
        return LocalTime.parse(s.trim(), timeFormat);
    } catch (error) {
        return undefined;
    }
}

function parseDateTime(s: string, zone: ZoneId = systemZone): ZonedDateTime {
    try {
        s = s.trim();
        let len = s.length;

        if (len < 4) {
            throw Error('Malformed date-time, must at least include year.');
        }

        // parse zone if present and trim this part from string
        const zoneStart = Math.max(s.indexOf('+'), s.indexOf('-'));
        if (zoneStart >= 4 && s.length === zoneStart + 5) {
            const signString = s.substring(zoneStart, zoneStart + 1);
            const zoneString = s.substring(zoneStart + 1, zoneStart + 5);
            zone = ZoneOffset.ofHoursMinutes(
                parseInt(signString + zoneString.substring(0, 2), 10),
                parseInt(signString + zoneString.substring(2, 4), 10),
            );
            s = s.substring(0, zoneStart);
            len = s.length;
        } else if (zoneStart >= 0) {
            throw Error('Malformed date-time. Zone is present but misplaced or not of length 5');
        }

        const validLengths = [4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20, 21];
        if (validLengths.indexOf(len) < 0) {
            throw Error('Malformed date-time, invalid length ' + len);
        }

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
                            if (s.charAt(14) === '.' && len >= 15) {
                                const end = Math.min(len, 21);
                                const precision = end - 15;
                                const exponent = 9 - precision;
                                nanoOfSecond = parseInt(s.substring(15, end), 10) * Math.pow(10, exponent);
                            }
                        }
                    }
                }
            }
        }

        return ZonedDateTime.of(year, month, dayOfMonth, hour, minute, second, nanoOfSecond, zone);
    } catch (error) {
        return undefined;
    }
}

export function parsePersonName(s: string): PersonName {
    function ensureLength(ss: string[], n: number): string[] {
        return ss.concat(new Array(Math.max(0, n - ss.length)).fill(''));
    }

    function transpose(matrix: string[][]): string[][] {
        return matrix[0].map((_, i) => matrix.map((col) => col[i]));
    }

    const matrix = ensureLength(s.split(/=/), 3)
        .map(trim)
        .map((s1) => ensureLength(s1.split(/\^/), 5));
    const comps = transpose(matrix).map((c) => new ComponentGroup(c[0], c[1], c[2]));
    return new PersonName(comps[0], comps[1], comps[2], comps[3], comps[4]);
}

function parseURL(s: string): URL {
    try {
        return new URL(s);
    } catch (error) {
        return undefined;
    }
}
