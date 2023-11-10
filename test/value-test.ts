import assert from 'assert';
import { LocalDate, LocalTime, ZonedDateTime, ZoneOffset } from 'js-joda';
import { concat, doubleToBytes, floatToBytes, intToBytes, intToBytesLE, shortToBytes } from '../src/base';
import { CharacterSets } from '../src/character-sets';
import { Value } from '../src/value';
import { VR } from '../src/vr';
import { PersonName, ComponentGroup } from '../src/person-name';

describe('Formatting bytes into multiple strings', () => {
    it('should return empty sequence for empty byte string', () => {
        assert.deepStrictEqual(Value.empty().toStrings(VR.SH), []);
    });

    it('should throw an exception for null input', () => {
        assert.throws(() => {
            new Value(null).toStrings(VR.SH);
        });
    });

    it('should split a string according to the DICOM multiple value delimiter', () => {
        assert.deepStrictEqual(Value.fromString(VR.CS, 'one\\two\\three').toStrings(VR.CS), ['one', 'two', 'three']);
    });

    it('should trim any characters at beginning and end', () => {
        assert.deepStrictEqual(
            Value.fromBytes(VR.CS, [0x20, 0x20, 0x20, 0x20, 0x41, 0x41, 0x20, 0x20, 0x20]).toStrings(VR.CS),
            ['AA'],
        );
    });

    it('should trim any characters at or below 0x20 at beginning and end of each value', () => {
        assert.deepStrictEqual(Value.fromString(VR.CS, '  one \\ two \\three  ').toStrings(VR.CS), [
            'one',
            'two',
            'three',
        ]);
    });

    it('should split and trim strings with multiple character set encodings', () => {
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
        assert.deepStrictEqual(
            Value.fromBuffer(VR.SH, nameBytes).toStrings(VR.SH, false, CharacterSets.fromNames('\\ISO 2022 IR 149')),
            ['Hong^Gildong=洪^吉洞=홍^길동'],
        );
    });
});

describe('Formatting bytes into a single string', () => {
    it('should return empty string for empty byte string', () => {
        assert.strictEqual(Value.empty().toSingleString(VR.SH), '');
    });

    it('should not split a string with DICOM multiple value delimiters', () => {
        assert.strictEqual(Value.fromString(VR.SH, 'one\\two\\three').toSingleString(VR.SH), 'one\\two\\three ');
    });

    it('should trim trailing spaces from string components', () => {
        assert.strictEqual(Value.fromString(VR.ST, '   one two  ').toSingleString(VR.ST), '   one two');
    });
});

describe('Creating an element', () => {
    it('should produce the expected bytes from string(s)', () => {
        assert.strictEqual(Value.fromString(VR.PN, 'John^Doe').toSingleString(VR.PN), 'John^Doe');
        assert.strictEqual(Value.fromString(VR.PN, 'John^Doe', true).toSingleString(VR.PN), 'John^Doe');
        assert.strictEqual(Value.fromString(VR.PN, 'John^Doe').toSingleString(VR.PN), 'John^Doe');
        assert.deepStrictEqual(Value.fromStrings(VR.PN, ['John^Doe', 'Jane^Doe']).toStrings(VR.PN), [
            'John^Doe',
            'Jane^Doe',
        ]);

        assert.strictEqual(Value.fromString(VR.AT, '00A01234').toSingleString(VR.AT), '(00a0,1234)');
        assert(3.1415 - parseFloat(Value.fromString(VR.FL, '3.1415').toSingleString(VR.FL)) < 0.001);
        assert.strictEqual(Value.fromString(VR.FD, '3.1415').toSingleString(VR.FD), '3.1415');
        assert.strictEqual(Value.fromString(VR.SL, '-1024').toSingleString(VR.SL), '-1024');
        assert.strictEqual(Value.fromString(VR.SS, '-1024').toSingleString(VR.SS), '-1024');

        assert.strictEqual(Value.fromString(VR.UL, '4294967295').toSingleString(VR.UL), '4294967295');
        assert.strictEqual(Value.fromString(VR.US, '65535').toSingleString(VR.US), '65535');
    });

    it('should produce the expected bytes from number(s)', () => {
        assert.strictEqual(Value.fromNumber(VR.UL, 1234).toNumber(VR.UL), 1234);
        assert.strictEqual(Value.fromNumber(VR.UL, 1234, true).toNumber(VR.UL, true), 1234);
        assert.deepStrictEqual(Value.fromNumbers(VR.UL, [512, 256]).toNumbers(VR.UL), [512, 256]);
        assert.strictEqual(Value.fromNumber(VR.AT, 0x00a01234).toNumber(VR.AT), 0x00a01234);
        assert(Math.abs(Value.fromNumber(VR.FL, 3.1415).toNumber(VR.FL) - 3.1415) < 0.0001);
        assert(Math.abs(Value.fromNumber(VR.FD, 3.1415).toNumber(VR.FD) - 3.1415) < 0.0001);
        assert.strictEqual(Value.fromNumber(VR.SL, -1024).toNumber(VR.SL), -1024);
        assert.strictEqual(Value.fromNumber(VR.SS, -1024).toNumber(VR.SS), -1024);
        assert.strictEqual(Value.fromNumber(VR.UL, 42).toNumber(VR.UL), 42);
        assert.strictEqual(Value.fromNumber(VR.US, 65535).toNumber(VR.US), 65535);
    });

    it('should produce the expected bytes from date(s)', () => {
        const date1 = LocalDate.of(2004, 3, 29);
        const date2 = LocalDate.of(2004, 3, 30);
        assert.deepStrictEqual(Value.fromDate(VR.DA, date1).toDate(), date1);
        assert.deepStrictEqual(Value.fromDates(VR.DA, [date1, date2]).toDates(), [date1, date2]);

        assert.deepStrictEqual(Value.fromDate(VR.DT, date1).toDate(), date1);
        assert.deepStrictEqual(Value.fromDate(VR.LT, date1).toString(VR.LT), '20040329');
    });

    it('should produce the expected bytes from time(s)', () => {
        const dt1 = LocalTime.of(11, 59, 35, 123456000);
        const dt2 = LocalTime.of(11, 59, 36, 123456000);
        assert.deepStrictEqual(Value.fromTime(VR.TM, dt1).toTime(), dt1);
        assert.deepStrictEqual(Value.fromTimes(VR.TM, [dt1, dt2]).toTimes(), [dt1, dt2]);

        assert.deepStrictEqual(Value.fromTime(VR.LT, dt1).toString(VR.LT), '115935.123456');
    });

    it('should produce the expected bytes from date-time(s)', () => {
        const dt1 = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 123456000, ZoneOffset.UTC);
        const dt2 = ZonedDateTime.of(2004, 3, 29, 11, 59, 36, 123456000, ZoneOffset.UTC);
        assert.deepStrictEqual(Value.fromDateTime(VR.DT, dt1).toDateTime(), dt1);
        assert.deepStrictEqual(Value.fromDateTimes(VR.DT, [dt1, dt2]).toDateTimes(), [dt1, dt2]);

        assert.deepStrictEqual(Value.fromDateTime(VR.LT, dt1).toString(VR.LT), '20040329115935.123456+0000');
    });

    it('should produce the expected bytes from person-name(s)', () => {
        const pn1 = new PersonName(new ComponentGroup('Doe'), new ComponentGroup('John'));
        const pn2 = new PersonName(
            new ComponentGroup('Doe', 'iDoe', 'pDoe'),
            new ComponentGroup('Jane', 'iJane', 'pJane'),
            new ComponentGroup('Middle', 'iMiddle', 'pMiddle'),
            new ComponentGroup('Prefix', 'iPrefix', 'pPrefix'),
            new ComponentGroup('Suffix', 'iSuffix', 'pSuffix'),
        );
        assert.deepStrictEqual(Value.fromPersonName(VR.PN, pn1).toPersonName(), pn1);
        assert.deepStrictEqual(Value.fromPersonNames(VR.PN, [pn1, pn2]).toPersonNames(), [pn1, pn2]);

        assert.deepStrictEqual(Value.fromPersonName(VR.PN, pn1).toString(VR.PN), 'Doe^John');
        assert.deepStrictEqual(
            Value.fromPersonName(VR.PN, pn2).toString(VR.PN),
            'Doe^Jane^Middle^Prefix^Suffix=iDoe^iJane^iMiddle^iPrefix^iSuffix=pDoe^pJane^pMiddle^pPrefix^pSuffix',
        );
    });

    it('should produce the expected bytes from an URL', () => {
        const url = new URL('https://example.com:8080/path?q1=45&q2=46#anchor');
        assert.deepStrictEqual(Value.fromURL(VR.UR, url).toURL(), url);
        assert.equal(url.protocol, 'https:');
        assert.equal(url.host, 'example.com:8080');
        assert.equal(url.port, 8080);
    });
});

describe('A Value', () => {
    it('should support adding additional bytes', () => {
        assert.deepStrictEqual(
            new Value(Buffer.from('one')).append(Buffer.from(' two')).bytes,
            new Value(Buffer.from('one two')).bytes,
        );
    });

    it('should support ensuring value has even length by adding padding', () => {
        assert.deepStrictEqual(
            Value.fromBytes(VR.OB, [111, 110, 101]).ensurePadding(VR.OB).bytes,
            Buffer.from([111, 110, 101, 0]),
        );
        assert.deepStrictEqual(
            Value.fromBytes(VR.SH, [111, 110, 101]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 32]),
        );
        assert.deepStrictEqual(
            Value.fromBytes(VR.SH, [111, 110, 101, 111]).ensurePadding(VR.SH).bytes,
            Buffer.from([111, 110, 101, 111]),
        );
    });
});

describe('Parsing number values', () => {
    it('should return empty sequence for empty byte string', () => {
        assert.deepStrictEqual(Value.empty().toNumbers(VR.SL), []);
    });

    it('should parse multiple int values', () => {
        assert.deepStrictEqual(
            Value.fromBuffer(VR.SL, concat(intToBytesLE(1234), intToBytesLE(1234567890))).toNumbers(VR.SL),
            [1234, 1234567890],
        );
    });

    it('should return int values for all numerical VRs', () => {
        assert(Math.abs(Value.fromBuffer(VR.FL, floatToBytes(Math.PI)).toNumber(VR.FL) - Math.PI) < 0.000001);
        assert(Math.abs(Value.fromBuffer(VR.FD, doubleToBytes(Math.PI)).toNumber(VR.FD) - Math.PI) < 0.000001);
        assert.deepStrictEqual(Value.fromBuffer(VR.SS, shortToBytes(-3)).toNumbers(VR.SS), [-3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.US, shortToBytes(-3)).toNumbers(VR.US), [(1 << 16) - 3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.SL, intToBytes(-3)).toNumbers(VR.SL), [-3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.UL, intToBytes(3)).toNumbers(VR.UL), [3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.DS, Buffer.from('3.1415')).toNumbers(VR.DS), [3.1415]);
        assert.deepStrictEqual(Value.fromBuffer(VR.IS, Buffer.from('-3')).toNumbers(VR.IS), [-3]);
        assert.deepStrictEqual(Value.fromBuffer(VR.AT, Buffer.from('-3')).toNumbers(VR.AT), []);
    });
});

describe('Parsing a single number value', () => {
    it('should return the first entry among multiple values', () => {
        assert.strictEqual(
            Value.fromBuffer(VR.SL, concat(intToBytesLE(1234), intToBytesLE(1234567890))).toNumber(VR.SL),
            1234,
        );
    });

    it('should return undefined if no entry exists', () => {
        assert(Value.empty().toNumber(VR.SL) === undefined);
    });
});

describe('Parsing date strings', () => {
    it('should return empty sequence for empty byte string', () => {
        assert.deepStrictEqual(Value.empty().toDates(VR.DA), []);
    });

    it('should parse properly formatted date strings', () => {
        const date = LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, ['20040329', '2004.03.29']).toDates(VR.DA), [date, date]);
    });

    it('should ignore improperly formatted entries', () => {
        const date = LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, ['20040329', 'one', '2004.03.29']).toDates(VR.DA), [
            date,
            date,
        ]);
        assert.deepStrictEqual(Value.fromString(VR.DA, 'one').toDates(VR.DA), []);
    });

    it('should trim whitespace', () => {
        const date = LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(
            Value.fromStrings(VR.DA, [' 20040329 ', '20040329 ', 'one', '2004.03.29  ']).toDates(VR.DA),
            [date, date, date],
        );
    });
});

describe('Parsing a single date string', () => {
    it('should return the first valid entry among multiple values', () => {
        const date = LocalDate.of(2004, 3, 29);
        assert.deepStrictEqual(Value.fromStrings(VR.DA, ['one', '20040329', '20050401']).toDate(VR.DA), date);
    });
});

describe('Parsing time strings', () => {
    it('should return empty sequence for empty byte string', () => {
        assert.deepStrictEqual(Value.empty().toTimes(VR.TM), []);
    });

    it('should parse partial time strings', () => {
        const hh = LocalTime.of(1, 0);
        const hhmm = LocalTime.of(1, 2);
        const hhmmss = LocalTime.of(1, 2, 3);
        const hhmmssS = LocalTime.of(1, 2, 3, 400000000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ['01', '0102', '010203', '010203.400000']).toTimes(VR.TM), [
            hh,
            hhmm,
            hhmmss,
            hhmmssS,
        ]);
    });

    it('should parse properly formatted time strings', () => {
        const time = LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ['100908.765432', '10:09:08.765432']).toTimes(VR.TM), [
            time,
            time,
        ]);
    });

    it('should ignore improperly formatted entries', () => {
        const time = LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ['100908.765432', 'one', '10:09:08.765432']).toTimes(VR.TM), [
            time,
            time,
        ]);
        assert.deepStrictEqual(Value.fromString(VR.TM, 'one').toTimes(VR.TM), []);
    });

    it('should trim whitespace', () => {
        const time = LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(
            Value.fromStrings(VR.TM, [' 100908.765432 ', '100908.765432 ', 'one', '10:09:08.765432  ']).toTimes(VR.TM),
            [time, time, time],
        );
    });
});

describe('Parsing a single time string', () => {
    it('should return the first valid entry among multiple values', () => {
        const time = LocalTime.of(10, 9, 8, 765432000);
        assert.deepStrictEqual(Value.fromStrings(VR.TM, ['one', '100908.765432', '100908.765432']).toTime(VR.TM), time);
    });
});

describe('Parsing date time strings', () => {
    it('should return empty sequence for empty byte string', () => {
        assert.deepStrictEqual(Value.empty().toDateTimes(VR.DT), []);
    });

    it('should parse partial date time strings', () => {
        const zone = ZonedDateTime.now().zone();
        const yyyy = ZonedDateTime.of(2004, 1, 1, 0, 0, 0, 0, zone);
        const yyyyMM = ZonedDateTime.of(2004, 3, 1, 0, 0, 0, 0, zone);
        const yyyyMMdd = ZonedDateTime.of(2004, 3, 29, 0, 0, 0, 0, zone);
        const yyyyMMddHH = ZonedDateTime.of(2004, 3, 29, 11, 0, 0, 0, zone);
        const yyyyMMddHHmm = ZonedDateTime.of(2004, 3, 29, 11, 59, 0, 0, zone);
        const yyyyMMddHHmmss = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 0, zone);
        const yyyyMMddHHmmssS = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 123456000, zone);
        const yyyyMMddHHmmssSZ = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 123456000, ZoneOffset.UTC);
        const dateTimes = Value.fromBuffer(
            VR.DT,
            Buffer.from(
                '2004\\200403\\20040329\\2004032911\\200403291159\\20040329115935\\20040329115935.123456\\' +
                    '20040329115935.123456+0000\\20040329115935.123456-0000',
            ),
        ).toDateTimes(VR.DT);

        assert.deepStrictEqual(dateTimes, [
            yyyy,
            yyyyMM,
            yyyyMMdd,
            yyyyMMddHH,
            yyyyMMddHHmm,
            yyyyMMddHHmmss,
            yyyyMMddHHmmssS,
            yyyyMMddHHmmssSZ,
            yyyyMMddHHmmssSZ,
        ]);
    });

    it('should parse date time strings with varying precision on fractional seconds part', () => {
        const zone = ZonedDateTime.now().zone();
        const yyyyMMddHHmmssS0 = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 0, zone);
        const yyyyMMddHHmmssS12 = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 120000000, zone);
        const yyyyMMddHHmmssSZ = ZonedDateTime.of(2004, 3, 29, 11, 59, 35, 120000000, ZoneOffset.UTC);

        const dateTimes = Value.fromBuffer(
            VR.DT,
            Buffer.from(
                '20040329115935.0\\20040329115935.000000\\20040329115935.12\\20040329115935.1200\\' +
                    '20040329115935.1200-0000',
            ),
        ).toDateTimes(VR.DT);

        assert.deepStrictEqual(dateTimes, [
            yyyyMMddHHmmssS0,
            yyyyMMddHHmmssS0,
            yyyyMMddHHmmssS12,
            yyyyMMddHHmmssS12,
            yyyyMMddHHmmssSZ,
        ]);
    });

    it('should ignore improperly formatted entries', () => {
        assert.deepStrictEqual(
            Value.fromBuffer(
                VR.DT,
                Buffer.from(
                    '200\\2004ab\\20040\\2004032\\200403291\\' +
                        '20040329115\\2004032911593\\200403291159356\\20040329115935.1234567\\20040329115935.12345+000\\' +
                        '20040329115935.123456+00000',
                ),
            ).toDateTimes(VR.DT),
            [],
        );
    });

    it('should allow time zone also with null components', () => {
        const dateTime = ZonedDateTime.of(2004, 1, 1, 0, 0, 0, 0, ZoneOffset.of('+0500'));
        assert.deepStrictEqual(Value.fromBuffer(VR.DT, Buffer.from('2004+0500')).toDateTime(VR.DT), dateTime);
    });

    it('should trim whitespace', () => {
        const dateTime = ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, ZoneOffset.UTC);
        assert.deepStrictEqual(
            Value.fromBuffer(
                VR.DT,
                Buffer.from(
                    ' 20040329053559.012345+0000 \\' + '20040329053559.012345+0000 \\one\\20040329053559.012345+0000  ',
                ),
            ).toDateTimes(VR.DT),
            [dateTime, dateTime, dateTime],
        );
    });

    it('should parse time zones', () => {
        const dateTime = ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, ZoneOffset.ofHours(3));
        assert.deepStrictEqual(
            Value.fromBuffer(VR.DT, Buffer.from('20040329053559.012345+0300')).toDateTime(VR.DT),
            dateTime,
        );
    });
});

describe('Parsing a single date time string', () => {
    it('should return the first valid entry among multiple values', () => {
        const dateTime = ZonedDateTime.of(2004, 3, 29, 5, 35, 59, 12345000, ZoneOffset.UTC);
        assert.deepStrictEqual(
            Value.fromBuffer(
                VR.DT,
                Buffer.from('one\\20040329053559.012345+0000\\20050329053559.012345+0000'),
            ).toDateTime(VR.DT),
            dateTime,
        );
    });
});

describe('Parsing person names', () => {
    const emptyPersonName = new PersonName(new ComponentGroup(''), new ComponentGroup(''));

    it('should return empty person name for empty byte string', () => {
        assert.deepStrictEqual(Value.empty().toPersonNames(VR.PN), [emptyPersonName]);
    });

    it('should parse properly formatted person names', () => {
        const pn1 = new PersonName(new ComponentGroup('Doe'), new ComponentGroup('John'));
        const pn2 = new PersonName(new ComponentGroup('Smith'), new ComponentGroup(''));
        const pn3 = new PersonName(new ComponentGroup('Doe'), new ComponentGroup('Jane'));
        assert.deepStrictEqual(Value.fromStrings(VR.PN, ['Doe^John', 'Smith', 'Doe^Jane']).toPersonNames(VR.PN), [
            pn1,
            pn2,
            pn3,
        ]);
    });

    it('should parse person names with ideographic and phonetic components', () => {
        // http://dicom.nema.org/dicom/2013/output/chtml/part05/sect_H.3.html
        const pn = new PersonName(
            new ComponentGroup('Yamada', '山田', 'やまだ'),
            new ComponentGroup('Tarou', '太郎', 'たろう'),
        );
        assert.deepStrictEqual(
            Value.fromStrings(VR.PN, ['Yamada^Tarou=山田^太郎=やまだ^たろう']).toPersonNames(VR.PN),
            [pn],
        );
    });

    it('should trim whitespace', () => {
        const pn1 = new PersonName(new ComponentGroup('Doe'), new ComponentGroup('John'));
        assert.deepStrictEqual(Value.fromStrings(VR.PN, [' Doe^John ']).toPersonNames(VR.PN), [pn1]);
    });
});

describe('Parsing a single person name', () => {
    it('should return the first entry among multiple values', () => {
        const pn1 = new PersonName(new ComponentGroup('Doe'), new ComponentGroup('John'));
        assert.deepStrictEqual(Value.fromStrings(VR.PN, ['Doe^John', 'Doe^Jane']).toPersonName(VR.PN), pn1);
    });
});

describe('Parsing a URL', () => {
    it('should work for valid URL strings', () => {
        const url = new Value(Buffer.from('https://example.com:8080/path?q1=45&q2=46')).toURL();
        assert.equal(url.protocol, 'https:');
        assert.equal(url.host, 'example.com:8080');
        assert.equal(url.port, 8080);
    });

    it('should not parse invalid URIs', () => {
        const url = new Value(Buffer.from('not < a > uri')).toURL();
        assert(url === undefined);
    });
});
