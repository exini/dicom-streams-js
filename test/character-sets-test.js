const assert = require("assert");
const {CharacterSets} = require("../src/character-sets");
const VR = require("../src/vr");

describe("Parsing a DICOM file", function () {

    it("should parse an Arab name correctly", function () {
        let expectedName = "قباني^لنزار";
        let nameBytes = Buffer.from([0xE2, 0xC8, 0xC7, 0xE6, 0xEA, 0x5E, 0xE4, 0xE6, 0xD2, 0xC7, 0xD1]);
        let cs = CharacterSets.fromName("ISO_IR 127");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a French name correctly", function () {
        let expectedName = "Buc^Jérôme";
        let nameBytes = Buffer.from([0x42, 0x75, 0x63, 0x5E, 0x4A, 0xE9, 0x72, 0xF4, 0x6D, 0x65]);
        let cs = CharacterSets.fromName("ISO_IR 100");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a German name correctly", function () {
        let expectedName = "Äneas^Rüdiger";
        let nameBytes = Buffer.from([0xC4, 0x6E, 0x65, 0x61, 0x73, 0x5E, 0x52, 0xFC, 0x64, 0x69, 0x67, 0x65, 0x72]);
        let cs = CharacterSets.fromName("ISO_IR 100");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Greek name correctly", function () {
        let expectedName = "Διονυσιος";
        let nameBytes = Buffer.from([0xC4, 0xE9, 0xEF, 0xED, 0xF5, 0xF3, 0xE9, 0xEF, 0xF2]);
        let cs = CharacterSets.fromName("ISO_IR 126");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    /* TODO add support for japanese multi-byte encodings
    it("should parse a Japanese name correctly (1)", function () {
        let expectedName = "Yamada^Tarou=山田^太郎=やまだ^たろう";
        let nameBytes = Buffer.from([0x59, 0x61, 0x6D, 0x61, 0x64, 0x61, 0x5E, 0x54, 0x61, 0x72, 0x6F, 0x75, 0x3D, 0x1B, 0x24, 0x42, 0x3B, 0x33, 0x45, 0x44, 0x1B, 0x28, 0x42, 0x5E, 0x1B, 0x24, 0x42, 0x42, 0x40, 0x4F, 0x3A, 0x1B, 0x28, 0x42, 0x3D, 0x1B, 0x24, 0x42, 0x24, 0x64, 0x24, 0x5E, 0x24, 0x40, 0x1B, 0x28, 0x42, 0x5E, 0x1B, 0x24, 0x42, 0x24, 0x3F, 0x24, 0x6D, 0x24, 0x26, 0x1B, 0x28, 0x42]);
        let cs = CharacterSets.fromNames(["","ISO 2022 IR 87"]);
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Japanese name correctly (2)", function () {
        let expectedName = "ﾔﾏﾀﾞ^ﾀﾛｳ=山田^太郎=やまだ^たろう";
        let nameBytes = Buffer.from([0xD4, 0xCF, 0xC0, 0xDE, 0x5E, 0xC0, 0xDB, 0xB3, 0x3D, 0x1B, 0x24, 0x42, 0x3B, 0x33, 0x45, 0x44, 0x1B, 0x28, 0x4A, 0x5E, 0x1B, 0x24, 0x42, 0x42, 0x40, 0x4F, 0x3A, 0x1B, 0x28, 0x4A, 0x3D, 0x1B, 0x24, 0x42, 0x24, 0x64, 0x24, 0x5E, 0x24, 0x40, 0x1B, 0x28, 0x4A, 0x5E, 0x1B, 0x24, 0x42, 0x24, 0x3F, 0x24, 0x6D, 0x24, 0x26, 0x1B, 0x28, 0x4A]);
        let cs = CharacterSets.fromNames(["ISO 2022 IR 13", "ISO 2022 IR 87"]);
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });
    */

    it("should parse a Japanese name correctly (3)", function () {
        let expectedName = "ﾔﾏﾀﾞ^ﾀﾛｳ";
        let nameBytes = Buffer.from([0xD4, 0xCF, 0xC0, 0xDE, 0x5E, 0xC0, 0xDB, 0xB3]);
        let cs = CharacterSets.fromName("ISO_IR 13");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Hebrew name correctly", function () {
        let expectedName = "שרון^דבורה";
        let nameBytes = Buffer.from([0xF9, 0xF8, 0xE5, 0xEF, 0x5E, 0xE3, 0xE1, 0xE5, 0xF8, 0xE4]);
        let cs = CharacterSets.fromName("ISO_IR 138");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Korean name correctly", function () {
        let expectedName = "Hong^Gildong=洪^吉洞=홍^길동";
        let nameBytes = Buffer.from([0x48, 0x6F, 0x6E, 0x67, 0x5E, 0x47, 0x69, 0x6C, 0x64, 0x6F, 0x6E, 0x67, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xFB, 0xF3, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xD1, 0xCE, 0xD4, 0xD7, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xC8, 0xAB, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xB1, 0xE6, 0xB5, 0xBF]);
        let cs = CharacterSets.fromNames(["", "ISO 2022 IR 149"]);
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Russian name correctly", function () {
        let expectedName = "Люкceмбypг";
        let nameBytes = Buffer.from([0xBB, 0xEE, 0xDA, 0x63, 0x65, 0xDC, 0xD1, 0x79, 0x70, 0xD3]);
        let cs = CharacterSets.fromName("ISO_IR 144");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Chinese name correctly (1)", function () {
        let expectedName = "Wang^XiaoDong=王^小東=";
        let nameBytes = Buffer.from([0x57, 0x61, 0x6E, 0x67, 0x5E, 0x58, 0x69, 0x61, 0x6F, 0x44, 0x6F, 0x6E, 0x67, 0x3D, 0xE7, 0x8E, 0x8B, 0x5E, 0xE5, 0xB0, 0x8F, 0xE6, 0x9D, 0xB1, 0x3D]);
        let cs = CharacterSets.fromName("ISO_IR 192");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it("should parse a Chinese name correctly (2)", function () {
        let expectedName = "Wang^XiaoDong=王^小东=";
        let nameBytes = Buffer.from([0x57, 0x61, 0x6E, 0x67, 0x5E, 0x58, 0x69, 0x61, 0x6F, 0x44, 0x6F, 0x6E, 0x67, 0x3D, 0xCD, 0xF5, 0x5E, 0xD0, 0xA1, 0xB6, 0xAB, 0x3D]);
        let cs = CharacterSets.fromName("GB18030");
        let name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });
});
