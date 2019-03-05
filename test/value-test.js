const assert = require("assert");
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
        assert.deepEqual(Value.fromBytes(VR.SH,[0x20, 0x20, 0x20, 0x20, 0x41, 0x41, 0x20, 0x20, 0x20]).toStrings(VR.SH), ["AA"]);
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
        assert.equal(Value.fromString(VR.SH,"one\\two\\three").toSingleString(VR.SH), "one\\two\\three");
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
            Value.fromBytes(VR.OB,[111, 110, 101]).ensurePadding(VR.OB).bytes,
            Buffer.from([111, 110, 101, 0]));
        assert.deepEqual(
            Value.fromBytes(VR.SH, [111, 110, 101]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 32]));
        assert.deepEqual(
            Value.fromBytes(VR.SH,[111, 110, 101, 111]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 111]));
    });
});