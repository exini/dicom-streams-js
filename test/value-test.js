const assert = require("assert");
const joda = require("js-joda");
const base = require("../src/base");
const {Value} = require("../src/value");
const VR = require("../src/vr");
const {CharacterSets} = require("../src/character-sets");

describe("Formatting bytes into multiple strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepStrictEqual(Value.empty().toStrings(VR.SH), []);
    });

    it("should throw an exception for null input", function () {
        assert.throws(() => {
            new Value(null).toStrings(VR.SH);
        });
    });

    it("should split a string according to the DICOM multiple value delimiter", function () {
        assert.deepStrictEqual(Value.fromString(VR.SH, "one\\two\\three").toStrings(VR.SH), ["one", "two", "three"]);
    });

    it("should trim any characters at beginning and end", function () {
        assert.deepStrictEqual(Value.fromBytes(VR.SH, [0x20, 0x20, 0x20, 0x20, 0x41, 0x41, 0x20, 0x20, 0x20]).toStrings(VR.SH), ["AA"]);
    });

    it("should trim any characters at or below 0x20 at beginning and end of each value", function () {
        assert.deepStrictEqual(Value.fromString(VR.SH, "  one \\ two \\three  ").toStrings(VR.SH), ["one", "two", "three"]);
    });

    it("should split and trim strings with multiple character set encodings", function () {
        let nameBytes = Buffer.from([0x48, 0x6F, 0x6E, 0x67, 0x5E, 0x47, 0x69, 0x6C, 0x64, 0x6F, 0x6E, 0x67, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xFB, 0xF3, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xD1, 0xCE, 0xD4, 0xD7, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xC8, 0xAB, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xB1, 0xE6, 0xB5, 0xBF]);
        assert.deepStrictEqual(Value.fromBuffer(VR.SH, nameBytes).toStrings(VR.SH, false, CharacterSets.fromNames(["", "ISO 2022 IR 149"])), ["Hong^Gildong=洪^吉洞=홍^길동"]);
    });
});

describe("Formatting bytes into a single string", function () {
    it("should return empty string for empty byte string", function () {
        assert.strictEqual(Value.empty().toSingleString(VR.SH), "");
    });

    it("should not split a string with DICOM multiple value delimiters", function () {
        assert.strictEqual(Value.fromString(VR.SH, "one\\two\\three").toSingleString(VR.SH), "one\\two\\three");
    });

    it("should trim the string components", function () {
        assert.strictEqual(Value.fromString(VR.SH, "   one two  ").toSingleString(VR.SH), "one two");
    });
});

describe("Creating an element", function () {
    it("should produce the expected bytes from string(s)", function () {
        assert.strictEqual(Value.fromString(VR.PN, "John^Doe").toSingleString(VR.PN), "John^Doe");
        assert.strictEqual(Value.fromString(VR.PN, "John^Doe", true).toSingleString(VR.PN), "John^Doe");
        assert.strictEqual(Value.fromString(VR.PN, "John^Doe").toSingleString(VR.PN), "John^Doe");
        assert.deepStrictEqual(Value.fromStrings(VR.PN, ["John^Doe", "Jane^Doe"]).toStrings(VR.PN), ["John^Doe", "Jane^Doe"]);

        assert.strictEqual(Value.fromString(VR.AT, "00A01234").toSingleString(VR.AT), "(00a0,1234)");
        assert(3.1415 - parseFloat(Value.fromString(VR.FL, "3.1415").toSingleString(VR.FL)) < 0.001);
        assert.strictEqual(Value.fromString(VR.FD, "3.1415").toSingleString(VR.FD), "3.1415");
        assert.strictEqual(Value.fromString(VR.SL, "-1024").toSingleString(VR.SL), "-1024");
        assert.strictEqual(Value.fromString(VR.SS, "-1024").toSingleString(VR.SS), "-1024");

        assert.strictEqual(Value.fromString(VR.UL, "4294967295").toSingleString(VR.UL), "4294967295");
        assert.strictEqual(Value.fromString(VR.US, "65535").toSingleString(VR.US), "65535");
    });

    it("should produce the expected bytes from number(s)", function () {
        assert.strictEqual(Value.fromNumber(VR.UL, 1234).toNumber(VR.UL), 1234);
        assert.strictEqual(Value.fromNumber(VR.UL, 1234, true).toNumber(VR.UL, true), 1234);
        assert.deepStrictEqual(Value.fromNumbers(VR.UL, [512, 256]).toNumbers(VR.UL), [512, 256]);
        assert.strictEqual(Value.fromNumber(VR.AT, 0x00A01234).toNumber(VR.AT), 0x00A01234);
        assert(Math.abs(Value.fromNumber(VR.FL, 3.1415).toNumber(VR.FL) - 3.1415) < 0.0001);
        assert(Math.abs(Value.fromNumber(VR.FD, 3.1415).toNumber(VR.FD) - 3.1415) < 0.0001);
        assert.strictEqual(Value.fromNumber(VR.SL, -1024).toNumber(VR.SL), -1024);
        assert.strictEqual(Value.fromNumber(VR.SS, -1024).toNumber(VR.SS), -1024);
        assert.strictEqual(Value.fromNumber(VR.UL, 42).toNumber(VR.UL), 42);
        assert.strictEqual(Value.fromNumber(VR.US, 65535).toNumber(VR.US), 65535);
    });

    it("should produce the expected bytes from date(s)", function () {
        let date1 = joda.LocalDate.of(2004, 3, 29);
        let date2 = joda.LocalDate.of(2004, 3, 30);
        assert.deepStrictEqual(Value.fromDate(VR.DA, date1).toDate(), date1);
        assert.deepStrictEqual(Value.fromDates(VR.DA, [date1, date2]).toDates(), [date1, date2]);

        assert.deepStrictEqual(Value.fromDate(VR.DT, date1).toDate(), date1);
        assert.deepStrictEqual(Value.fromDate(VR.LT, date1).toString(VR.LT), "20040329");
    });

    it("should produce the expected bytes from time(s)", function () {
        let dt1 = joda.LocalTime.of(11, 59, 35, 123456000);
        let dt2 = joda.LocalTime.of(11, 59, 36, 123456000);
        assert.deepStrictEqual(Value.fromTime(VR.TM, dt1).toTime(), dt1);
        assert.deepStrictEqual(Value.fromTimes(VR.TM, [dt1, dt2]).toTimes(), [dt1, dt2]);

        assert.deepStrictEqual(Value.fromTime(VR.LT, dt1).toString(VR.LT), "115935.123456");
    });

    it("should produce the expected bytes from date-time(s)", function () {
        let dt1 = joda.ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 123456000, joda.ZoneOffset.UTC);
        let dt2 = joda.ZonedDateTime.of(2004, 3, 29, 11, 59, 36, 123456000, joda.ZoneOffset.UTC);
        assert.deepStrictEqual(Value.fromDateTime(VR.DT, dt1).toDateTime(), dt1);
        assert.deepStrictEqual(Value.fromDateTimes(VR.DT, [dt1, dt2]).toDateTimes(), [dt1, dt2]);

        assert.deepStrictEqual(Value.fromDateTime(VR.LT, dt1).toString(VR.LT), "20040329115935.123456+0000");
    });

});

describe("A Value", function () {
    it("should support adding additional bytes", function () {
        assert.deepStrictEqual(
            new Value(Buffer.from("one")).append(Buffer.from(" two")).bytes,
            new Value(Buffer.from("one two")).bytes);
    });

    it("should support ensuring value has even length by adding padding", function () {
        assert.deepStrictEqual(
            Value.fromBytes(VR.OB, [111, 110, 101]).ensurePadding(VR.OB).bytes,
            Buffer.from([111, 110, 101, 0]));
        assert.deepStrictEqual(
            Value.fromBytes(VR.SH, [111, 110, 101]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 32]));
        assert.deepStrictEqual(
            Value.fromBytes(VR.SH, [111, 110, 101, 111]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 111]));
    });
});

describe("Parsing number values", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepStrictEqual(Value.empty().toNumbers(VR.SL), []);
    });

    it("should parse multiple int values", function () {
        assert.deepStrictEqual(Value.fromBuffer(VR.SL, base.concat(base.intToBytesLE(1234), base.intToBytesLE(1234567890)))
            .toNumbers(VR.SL), [1234, 1234567890]);
    });

    it("should return int values for all numerical VRs", function () {
        assert(Math.abs(Value.fromBuffer(VR.FL, base.floatToBytes(Math.PI)).toNumbers(VR.FL) - Math.PI) < 0.000001);
        assert(Math.abs(Value.fromBuffer(VR.FD, base.doubleToBytes(Math.PI)).toNumbers(VR.FD) - Math.PI) < 0.000001);
        assert.deepStrictEqual(Value.fromBuffer(VR.SS, base.shortToBytes(-3)).toNumbers(VR.SS), [-3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.US, base.shortToBytes(-3)).toNumbers(VR.US), [(1 << 16) - 3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.SL, base.intToBytes(-3)).toNumbers(VR.SL), [-3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.UL, base.intToBytes(3)).toNumbers(VR.UL), [3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.DS, Buffer.from("3.1415")).toNumbers(VR.DS), [3.1415]);
        assert.deepStrictEqual(Value.fromBuffer(VR.IS, Buffer.from("-3")).toNumbers(VR.IS), [-3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.AT, Buffer.from("-3")).toNumbers(VR.AT), []);
    });
});

describe("Parsing a single int value", function () {
    it("should return the first entry among multiple values", function () {
        assert.strictEqual(Value.fromBuffer(VR.SL, base.concat(base.intToBytesLE(1234), base.intToBytesLE(1234567890))).toNumber(VR.SL), 1234);
    });

    it("should return undefined if no entry exists", function () {
        assert(Value.empty().toNumber(VR.SL) === undefined);
    });
});

describe("Parsing date strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepStrictEqual(Value.empty().toDates(VR.DA), []);
    });

    it("should parse properly formatted date strings", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, ["20040329", "2004.03.29"]).toDates(VR.DA), [date, date]);
    });

    it("should ignore improperly formatted entries", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, ["20040329", "one", "2004.03.29"]).toDates(VR.DA), [date, date]);
        assert.deepStrictEqual(Value.fromString(VR.DA, "one").toDates(VR.DA), []);
    });

    it("should trim whitespace", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, [" 20040329 ", "20040329 ", "one", "2004.03.29  "]).toDates(VR.DA), [date, date, date]);
    });
});

describe("Parsing a single date string", function () {
    it("should return the first valid entry among multiple values", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, ["one", "20040329", "20050401"]).toDate(VR.DA), date);
    });
});

describe("Parsing time strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepStrictEqual(Value.empty().toTimes(VR.TM), []);
    });

    it("should parse partial time strings", function () {
        let hh = joda.LocalTime.of(1, 0);
        let hhmm = joda.LocalTime.of(1, 2);
        let hhmmss = joda.LocalTime.of(1, 2, 3);
        let hhmmssS = joda.LocalTime.of(1, 2, 3, 400000000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ["01", "0102", "010203", "010203.400000"]).toTimes(VR.TM), [hh, hhmm, hhmmss, hhmmssS]);
    });

    it("should parse properly formatted time strings", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ["100908.765432", "10:09:08.765432"]).toTimes(VR.TM), [time, time]);
    });

    it("should ignore improperly formatted entries", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ["100908.765432", "one", "10:09:08.765432"]).toTimes(VR.TM), [time, time]);
        assert.deepStrictEqual(Value.fromString(VR.TM, "one").toTimes(VR.TM), []);
    });

    it("should trim whitespace", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, [" 100908.765432 ", "100908.765432 ", "one", "10:09:08.765432  "]).toTimes(VR.TM), [time, time, time]);
    });
});

describe("Parsing a single time string", function () {
    it("should return the first valid entry among multiple values", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ["one", "100908.765432", "100908.765432"]).toTime(VR.TM), time);
    });
});

describe("Parsing date time strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepStrictEqual(Value.empty().toDateTimes(VR.DT), []);
    });

    it("should parse partial date time strings", function () {
        let zone = joda.ZonedDateTime.now().zone();
        let yyyy = joda.ZonedDateTime.of(2004, 1, 1, 0, 0, 0, 0, zone);
        let yyyyMM = joda.ZonedDateTime.of(2004, 3, 1, 0, 0, 0, 0, zone);
        let yyyyMMdd = joda.ZonedDateTime.of(2004, 3, 29, 0, 0, 0, 0, zone);
        let yyyyMMddHH = joda.ZonedDateTime.of(2004, 3, 29, 11, 0, 0, 0, zone);
        let yyyyMMddHHmm = joda.ZonedDateTime.of(2004, 3, 29, 11, 59, 0, 0, zone);
        let yyyyMMddHHmmss = joda.ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 0, zone);
        let yyyyMMddHHmmssS = joda.ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 123456000, zone);
        let yyyyMMddHHmmssSZ = joda.ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 123456000, joda.ZoneOffset.UTC);
        let dateTimes = Value.fromBuffer(VR.DT, Buffer.from("2004\\200403\\20040329\\2004032911\\200403291159\\20040329115935\\20040329115935.123456\\20040329115935.123456+0000\\20040329115935.123456-0000")).toDateTimes(VR.DT);
        assert.deepStrictEqual(
            dateTimes,
            [yyyy, yyyyMM, yyyyMMdd, yyyyMMddHH, yyyyMMddHHmm, yyyyMMddHHmmss, yyyyMMddHHmmssS, yyyyMMddHHmmssSZ, yyyyMMddHHmmssSZ]
        );
    });

    it("should ignore improperly formatted entries", function () {
        assert.deepStrictEqual(Value.fromBuffer(VR.DT, Buffer.from("200\\2004ab\\20040\\2004032\\200403291\\20040329115\\2004032911593\\200403291159356\\20040329115935.1234567\\20040329115935.12345+000\\20040329115935.123456+00000")).toDateTimes(VR.DT), []);
    });

    it("should allow time zone also with null components", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 1, 1, 0, 0, 0, 0, joda.ZoneOffset.of("+0500"));
        assert.deepStrictEqual(Value.fromBuffer(VR.DT, Buffer.from("2004+0500")).toDateTime(VR.DT), dateTime);
    });

    it("should trim whitespace", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, joda.ZoneOffset.UTC);
        assert.deepStrictEqual(Value.fromBuffer(VR.DT, Buffer.from(" 20040329053559.012345+0000 \\20040329053559.012345+0000 \\one\\20040329053559.012345+0000  ")).toDateTimes(VR.DT), [dateTime, dateTime, dateTime]);
    });

    it("should parse time zones", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, joda.ZoneOffset.ofHours(3));
        assert.deepStrictEqual(Value.fromBuffer(VR.DT, Buffer.from("20040329053559.012345+0300")).toDateTime(VR.DT), dateTime);
    });
});

describe("Parsing a single date time string", function () {
    it("should return the first valid entry among multiple values", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, joda.ZoneOffset.UTC);
        assert.deepStrictEqual(Value.fromBuffer(VR.DT, Buffer.from("one\\20040329053559.012345+0000\\20050329053559.012345+0000")).toDateTime(VR.DT), dateTime);
    });
});
