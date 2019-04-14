const assert = require("assert");
const joda = require("js-joda");
const {Value} = require("../src/value");
const VR = require("../src/vr");
const {CharacterSets} = require("../src/character-sets");

describe("Formatting bytes into multiple strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepEqual(Value.empty().toStrings(VR.SH), []);
    });

    it("should throw an exception for null input", function () {
        assert.throws(() => {
            new Value(null).toStrings(VR.SH);
        });
    });

    it("should split a string according to the DICOM multiple value delimiter", function () {
        assert.deepEqual(Value.fromString(VR.SH, "one\\two\\three").toStrings(VR.SH), ["one", "two", "three"]);
    });

    it("should trim any characters at beginning and end", function () {
        assert.deepEqual(Value.fromBytes(VR.SH, [0x20, 0x20, 0x20, 0x20, 0x41, 0x41, 0x20, 0x20, 0x20]).toStrings(VR.SH), ["AA"]);
    });

    it("should trim any characters at or below 0x20 at beginning and end of each value", function () {
        assert.deepEqual(Value.fromString(VR.SH, "  one \\ two \\three  ").toStrings(VR.SH), ["one", "two", "three"]);
    });

    it("should split and trim strings with multiple character set encodings", function () {
        let nameBytes = Buffer.from([0x48, 0x6F, 0x6E, 0x67, 0x5E, 0x47, 0x69, 0x6C, 0x64, 0x6F, 0x6E, 0x67, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xFB, 0xF3, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xD1, 0xCE, 0xD4, 0xD7, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xC8, 0xAB, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xB1, 0xE6, 0xB5, 0xBF]);
        assert.deepEqual(Value.fromBuffer(VR.SH, nameBytes).toStrings(VR.SH, false, CharacterSets.fromNames(["", "ISO 2022 IR 149"])), ["Hong^Gildong=洪^吉洞=홍^길동"]);
    });
});

describe("Formatting bytes into a single string", function () {
    it("should return empty string for empty byte string", function () {
        assert.equal(Value.empty().toSingleString(VR.SH), "");
    });

    it("should not split a string with DICOM multiple value delimiters", function () {
        assert.equal(Value.fromString(VR.SH, "one\\two\\three").toSingleString(VR.SH), "one\\two\\three");
    });

    it("should trim the string components", function () {
        assert.equal(Value.fromString(VR.SH, "   one two  ").toSingleString(VR.SH), "one two");
    });
});

describe("Creating an element", function () {
    it("should produce the expected bytes from string(s)", function () {
        assert.equal(Value.fromString(VR.PN, "John^Doe").toSingleString(VR.PN), "John^Doe");
        assert.equal(Value.fromString(VR.PN, "John^Doe", true).toSingleString(VR.PN), "John^Doe");
        assert.equal(Value.fromString(VR.PN, "John^Doe").toSingleString(VR.PN), "John^Doe");
        assert.deepEqual(Value.fromStrings(VR.PN, ["John^Doe", "Jane^Doe"]).toStrings(VR.PN), ["John^Doe", "Jane^Doe"]);

        assert.equal(Value.fromString(VR.AT, "00A01234").toSingleString(VR.AT), "(00a0,1234)");
        assert(3.1415 - parseFloat(Value.fromString(VR.FL, "3.1415").toSingleString(VR.FL)) < 0.001);
        assert.equal(Value.fromString(VR.FD, "3.1415").toSingleString(VR.FD), "3.1415");
        assert.equal(Value.fromString(VR.SL, "-1024").toSingleString(VR.SL), "-1024");
        assert.equal(Value.fromString(VR.SS, "-1024").toSingleString(VR.SS), "-1024");

        assert.equal(Value.fromString(VR.UL, "4294967295").toSingleString(VR.UL), "4294967295");
        assert.equal(Value.fromString(VR.US, "65535").toSingleString(VR.US), "65535");
    });
});

describe("A Value", function () {
    it("should support adding additional bytes", function () {
        assert.deepEqual(
            new Value(Buffer.from("one")).append(Buffer.from(" two")).bytes,
            new Value(Buffer.from("one two")).bytes);
    });

    it("should support ensuring value has even length by adding padding", function () {
        assert.deepEqual(
            Value.fromBytes(VR.OB, [111, 110, 101]).ensurePadding(VR.OB).bytes,
            Buffer.from([111, 110, 101, 0]));
        assert.deepEqual(
            Value.fromBytes(VR.SH, [111, 110, 101]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 32]));
        assert.deepEqual(
            Value.fromBytes(VR.SH, [111, 110, 101, 111]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 111]));
    });
});

describe("Parsing date strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepEqual(Value.empty().toDates(VR.DA), []);
    });

    it("should parse properly formatted date strings", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepEqual(Value.fromStrings(VR.DA, ["20040329", "2004.03.29"]).toDates(VR.DA), [date, date]);
    });

    it("should ignore improperly formatted entries", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepEqual(Value.fromStrings(VR.DA, ["20040329", "one", "2004.03.29"]).toDates(VR.DA), [date, date]);
        assert.deepEqual(Value.fromString(VR.DA, "one").toDates(VR.DA), []);
    });

    it("should trim whitespace", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepEqual(Value.fromStrings(VR.DA, [" 20040329 ", "20040329 ", "one", "2004.03.29  "]).toDates(VR.DA), [date, date, date]);
    });
});

describe("Parsing a single date string", function () {
    it("should return the first valid entry among multiple values", function () {
        let date = joda.LocalDate.of(2004, 3, 29);
        assert.deepEqual(Value.fromStrings(VR.DA, ["one", "20040329", "20050401"]).toDate(VR.DA), date);
    });
});

describe("Parsing time strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepEqual(Value.empty().toTimes(VR.TM), []);
    });

    it("should parse partial time strings", function () {
        let hh = joda.LocalTime.of(1, 0);
        let hhmm = joda.LocalTime.of(1, 2);
        let hhmmss = joda.LocalTime.of(1, 2, 3);
        let hhmmssS = joda.LocalTime.of(1, 2, 3, 400000000);
        assert.deepEqual(Value.fromStrings(VR.TM, ["01", "0102", "010203", "010203.400000"]).toTimes(VR.TM), [hh, hhmm, hhmmss, hhmmssS]);
    });

    it("should parse properly formatted time strings", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepEqual(Value.fromStrings(VR.TM, ["100908.765432", "10:09:08.765432"]).toTimes(VR.TM), [time, time]);
    });

    it("should ignore improperly formatted entries", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepEqual(Value.fromStrings(VR.TM, ["100908.765432", "one", "10:09:08.765432"]).toTimes(VR.TM), [time, time]);
        assert.deepEqual(Value.fromString(VR.TM, "one").toTimes(VR.TM), []);
    });

    it("should trim whitespace", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepEqual(Value.fromStrings(VR.TM, [" 100908.765432 ", "100908.765432 ", "one", "10:09:08.765432  "]).toTimes(VR.TM), [time, time, time]);
    });
});

describe("Parsing a single time string", function () {
    it("should return the first valid entry among multiple values", function () {
        let time = joda.LocalTime.of(10, 9, 8, 765432000);
        assert.deepEqual(Value.fromStrings(VR.TM, ["one", "100908.765432", "100908.765432"]).toTime(VR.TM), time);
    });
});

describe("Parsing date time strings", function () {
    it("should return empty sequence for empty byte string", function () {
        assert.deepEqual(Value.empty().toDateTimes(VR.DT), []);
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
        assert.deepEqual(
            dateTimes,
            [yyyy, yyyyMM, yyyyMMdd, yyyyMMddHH, yyyyMMddHHmm, yyyyMMddHHmmss, yyyyMMddHHmmssS, yyyyMMddHHmmssSZ, yyyyMMddHHmmssSZ]
        );
    });

    it("should ignore improperly formatted entries", function () {
        assert.deepEqual(Value.fromBuffer(VR.DT, Buffer.from("200\\2004ab\\20040\\2004032\\200403291\\20040329115\\2004032911593\\200403291159356\\20040329115935.1234567\\20040329115935.12345+000\\20040329115935.123456+00000")).toDateTimes(VR.DT), []);
    });

    it("should allow time zone also with null components", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 1, 1, 0, 0, 0, 0, joda.ZoneOffset.of("+0500"));
        assert.deepEqual(Value.fromBuffer(VR.DT, Buffer.from("2004+0500")).toDateTime(VR.DT), dateTime);
    });

    it("should trim whitespace", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, joda.ZoneOffset.UTC);
        assert.deepEqual(Value.fromBuffer(VR.DT, Buffer.from(" 20040329053559.012345+0000 \\20040329053559.012345+0000 \\one\\20040329053559.012345+0000  ")).toDateTimes(VR.DT), [dateTime, dateTime, dateTime]);
    });

    it("should parse time zones", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, joda.ZoneOffset.ofHours(3));
        assert.deepEqual(Value.fromBuffer(VR.DT, Buffer.from("20040329053559.012345+0300")).toDateTime(VR.DT), dateTime);
    });
});

describe("Parsing a single date time string", function () {
    it("should return the first valid entry among multiple values", function () {
        let dateTime = joda.ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, joda.ZoneOffset.UTC);
        assert.deepEqual(Value.fromBuffer(VR.DT, Buffer.from("one\\20040329053559.012345+0000\\20050329053559.012345+0000")).toDateTime(VR.DT), dateTime);
    });
});
