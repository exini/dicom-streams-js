import assert from 'assert';
import { CharacterSets } from '../src/character-sets';
import { VR } from '../src/vr';

describe('Parsing a DICOM file', () => {
    it('should parse an Arab name correctly', () => {
        const expectedName = 'قباني^لنزار';
        const nameBytes = Buffer.from([0xe2, 0xc8, 0xc7, 0xe6, 0xea, 0x5e, 0xe4, 0xe6, 0xd2, 0xc7, 0xd1]);
        const cs = CharacterSets.fromNames('ISO_IR 127');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a French name correctly', () => {
        const expectedName = 'Buc^Jérôme';
        const nameBytes = Buffer.from([0x42, 0x75, 0x63, 0x5e, 0x4a, 0xe9, 0x72, 0xf4, 0x6d, 0x65]);
        const cs = CharacterSets.fromNames('ISO_IR 100');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a German name correctly', () => {
        const expectedName = 'Äneas^Rüdiger';
        const nameBytes = Buffer.from([0xc4, 0x6e, 0x65, 0x61, 0x73, 0x5e, 0x52, 0xfc, 0x64, 0x69, 0x67, 0x65, 0x72]);
        const cs = CharacterSets.fromNames('ISO_IR 100');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Greek name correctly', () => {
        const expectedName = 'Διονυσιος';
        const nameBytes = Buffer.from([0xc4, 0xe9, 0xef, 0xed, 0xf5, 0xf3, 0xe9, 0xef, 0xf2]);
        const cs = CharacterSets.fromNames('ISO_IR 126');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Japanese name correctly (1)', () => {
        const expectedName = 'Yamada^Tarou=山田^太郎=やまだ^たろう';
        const nameBytes = Buffer.from([
            0x59,
            0x61,
            0x6d,
            0x61,
            0x64,
            0x61,
            0x5e,
            0x54,
            0x61,
            0x72,
            0x6f,
            0x75,
            0x3d,
            0x1b,
            0x24,
            0x42,
            0x3b,
            0x33,
            0x45,
            0x44,
            0x1b,
            0x28,
            0x42,
            0x5e,
            0x1b,
            0x24,
            0x42,
            0x42,
            0x40,
            0x4f,
            0x3a,
            0x1b,
            0x28,
            0x42,
            0x3d,
            0x1b,
            0x24,
            0x42,
            0x24,
            0x64,
            0x24,
            0x5e,
            0x24,
            0x40,
            0x1b,
            0x28,
            0x42,
            0x5e,
            0x1b,
            0x24,
            0x42,
            0x24,
            0x3f,
            0x24,
            0x6d,
            0x24,
            0x26,
            0x1b,
            0x28,
            0x42,
        ]);
        const cs = CharacterSets.fromNames('\\ISO 2022 IR 87');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Japanese name correctly (2)', () => {
        const expectedName = 'ﾔﾏﾀﾞ^ﾀﾛｳ=山田^太郎=やまだ^たろう';
        const nameBytes = Buffer.from([
            0xd4,
            0xcf,
            0xc0,
            0xde,
            0x5e,
            0xc0,
            0xdb,
            0xb3,
            0x3d,
            0x1b,
            0x24,
            0x42,
            0x3b,
            0x33,
            0x45,
            0x44,
            0x1b,
            0x28,
            0x4a,
            0x5e,
            0x1b,
            0x24,
            0x42,
            0x42,
            0x40,
            0x4f,
            0x3a,
            0x1b,
            0x28,
            0x4a,
            0x3d,
            0x1b,
            0x24,
            0x42,
            0x24,
            0x64,
            0x24,
            0x5e,
            0x24,
            0x40,
            0x1b,
            0x28,
            0x4a,
            0x5e,
            0x1b,
            0x24,
            0x42,
            0x24,
            0x3f,
            0x24,
            0x6d,
            0x24,
            0x26,
            0x1b,
            0x28,
            0x4a,
        ]);
        const cs = CharacterSets.fromNames('ISO 2022 IR 13\\ISO 2022 IR 87');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Japanese name correctly (3)', () => {
        const expectedName = 'ﾔﾏﾀﾞ^ﾀﾛｳ';
        const nameBytes = Buffer.from([0xd4, 0xcf, 0xc0, 0xde, 0x5e, 0xc0, 0xdb, 0xb3]);
        const cs = CharacterSets.fromNames('ISO_IR 13');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Hebrew name correctly', () => {
        const expectedName = 'שרון^דבורה';
        const nameBytes = Buffer.from([0xf9, 0xf8, 0xe5, 0xef, 0x5e, 0xe3, 0xe1, 0xe5, 0xf8, 0xe4]);
        const cs = CharacterSets.fromNames('ISO_IR 138');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Korean name correctly', () => {
        const expectedName = 'Hong^Gildong=洪^吉洞=홍^길동';
        const nameBytes = Buffer.from([
            0x48,
            0x6f,
            0x6e,
            0x67,
            0x5e,
            0x47,
            0x69,
            0x6c,
            0x64,
            0x6f,
            0x6e,
            0x67,
            0x3d,
            0x1b,
            0x24,
            0x29,
            0x43,
            0xfb,
            0xf3,
            0x5e,
            0x1b,
            0x24,
            0x29,
            0x43,
            0xd1,
            0xce,
            0xd4,
            0xd7,
            0x3d,
            0x1b,
            0x24,
            0x29,
            0x43,
            0xc8,
            0xab,
            0x5e,
            0x1b,
            0x24,
            0x29,
            0x43,
            0xb1,
            0xe6,
            0xb5,
            0xbf,
        ]);
        const cs = CharacterSets.fromNames('\\ISO 2022 IR 149');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Russian name correctly', () => {
        const expectedName = 'Люкceмбypг';
        const nameBytes = Buffer.from([0xbb, 0xee, 0xda, 0x63, 0x65, 0xdc, 0xd1, 0x79, 0x70, 0xd3]);
        const cs = CharacterSets.fromNames('ISO_IR 144');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Chinese name correctly (1)', () => {
        const expectedName = 'Wang^XiaoDong=王^小東=';
        const nameBytes = Buffer.from([
            0x57,
            0x61,
            0x6e,
            0x67,
            0x5e,
            0x58,
            0x69,
            0x61,
            0x6f,
            0x44,
            0x6f,
            0x6e,
            0x67,
            0x3d,
            0xe7,
            0x8e,
            0x8b,
            0x5e,
            0xe5,
            0xb0,
            0x8f,
            0xe6,
            0x9d,
            0xb1,
            0x3d,
        ]);
        const cs = CharacterSets.fromNames('ISO_IR 192');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });

    it('should parse a Chinese name correctly (2)', () => {
        const expectedName = 'Wang^XiaoDong=王^小东=';
        const nameBytes = Buffer.from([
            0x57,
            0x61,
            0x6e,
            0x67,
            0x5e,
            0x58,
            0x69,
            0x61,
            0x6f,
            0x44,
            0x6f,
            0x6e,
            0x67,
            0x3d,
            0xcd,
            0xf5,
            0x5e,
            0xd0,
            0xa1,
            0xb6,
            0xab,
            0x3d,
        ]);
        const cs = CharacterSets.fromNames('GB18030');
        const name = cs.decode(nameBytes, VR.PN);
        assert.strictEqual(name, expectedName);
    });
});
