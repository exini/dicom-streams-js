import assert from 'assert';
import { LocalDate, LocalTime, ZoneOffset } from 'js-joda';
import {
    appendToArray,
    concat,
    concatv,
    defaultCharacterSet,
    emptyBuffer,
    indeterminateLength,
    item,
    itemDelimitation,
    sequenceDelimitation,
    systemZone,
    flatten,
} from '../src/base';
import {
    ElementSet,
    Fragment,
    FragmentElement,
    Fragments,
    FragmentsElement,
    Item,
    ItemDelimitationElement,
    ItemElement,
    preambleElement,
    Sequence,
    SequenceDelimitationElement,
    SequenceElement,
    ValueElement,
} from '../src/dicom-elements';
import { HeaderPart } from '../src/dicom-parts';
import { Tag } from '../src/tag';
import { TagPath, emptyTagPath } from '../src/tag-path';
import { Value } from '../src/value';
import { VR } from '../src/vr';
import * as data from './test-data';
import { CharacterSets } from '../src/character-sets';
import { PersonName } from '../src/person-name';
import { Elements } from '../src/elements';

function create(...elems: ElementSet[]): Elements {
    return elems.reduce((e, s) => e.setElementSet(s), Elements.empty());
}

const studyDate = new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20041230'));
const patientName = new ValueElement(Tag.PatientName, VR.PN, Value.fromString(VR.PN, 'John^Doe'));
const patientID1 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, '12345678'));
const patientID2 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, '87654321'));
const patientID3 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, '18273645'));
const seq = new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [
    new Item(create(patientID1), indeterminateLength, false),
    new Item(create(patientID2), indeterminateLength, false),
]);

const elements = create(studyDate, seq, patientName);

describe('Elements', () => {
    it('should return an existing element', () => {
        assert.strictEqual(elements.valueElementByTag(Tag.PatientName), patientName);
        assert.strictEqual(elements.valueElementByPath(TagPath.fromTag(Tag.PatientName)), patientName);
        assert.strictEqual(
            elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientID)),
            patientID1,
        );
        assert.strictEqual(
            elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientID)),
            patientID2,
        );
    });

    it('should support empty and contains tests', () => {
        assert(!elements.isEmpty());
        assert(elements.nonEmpty());
        assert(elements.contains(Tag.StudyDate));
        assert(elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1)));
        assert(!elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 3)));
        assert(elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientID)));
        assert(!elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName)));
        assert.strictEqual(elements.head(), studyDate);
    });

    it('should support sorting elements', () => {
        const unsorted = new Elements(defaultCharacterSet, systemZone, [patientName, studyDate]);
        assert.strictEqual(unsorted.head(), patientName);
        const sorted = unsorted.sorted();
        assert.strictEqual(sorted.head(), studyDate);
        assert.strictEqual(unsorted.head(), patientName); // check immutable
    });

    it('should return undefined for missing element', () => {
        assert.strictEqual(elements.valueByTag(Tag.SeriesDate), undefined);
    });

    it('should return value elements only', () => {
        assert.strictEqual(elements.valueElementByTag(Tag.PatientName), patientName);
        assert.strictEqual(elements.valueElementByPath(TagPath.fromTag(Tag.PatientName)), patientName);
        assert.strictEqual(elements.valueElementByTag(Tag.SeriesDate), undefined);
        assert.strictEqual(elements.valueElementByTag(Tag.DerivationCodeSequence), undefined);
    });

    it('should return the value of an element', () => {
        const value = elements.valueByTag(Tag.PatientName);
        assert(value !== undefined);
        assert(value.length > 0);
        assert(elements.valueByTag(Tag.SeriesDate) === undefined);
        assert(elements.valueByPath(TagPath.fromTag(Tag.PatientName)) !== undefined);
    });

    it('should return the bytes of an element', () => {
        assert(elements.bytesByTag(Tag.PatientName) !== undefined);
        assert(elements.bytesByPath(TagPath.fromTag(Tag.PatientName)) !== undefined);
    });

    it('should return all strings in value with VM > 1', () => {
        const elems = create(
            new ValueElement(Tag.ImageType, VR.CS, Value.fromString(VR.CS, 'ORIGINAL\\RECON TOMO')),
            seq,
        );
        const strings = elems.stringsByTag(Tag.ImageType);
        assert.strictEqual(strings.length, 2);
        assert.strictEqual(strings[1], 'RECON TOMO');
        assert.strictEqual(elems.stringsByPath(TagPath.fromTag(Tag.ImageType)).length, 2);
        assert.strictEqual(elems.stringsByTag(Tag.SeriesDate).length, 0);
        assert.strictEqual(elems.stringsByTag(Tag.DerivationCodeSequence).length, 0);
    });

    it('should return a concatenated string in value with VM > 1', () => {
        const elems = create(new ValueElement(Tag.ImageType, VR.CS, Value.fromString(VR.CS, 'ORIGINAL\\RECON TOMO')));
        assert.strictEqual(elems.singleStringByTag(Tag.ImageType), 'ORIGINAL\\RECON TOMO');
        assert.strictEqual(elems.singleStringByPath(TagPath.fromTag(Tag.ImageType)), 'ORIGINAL\\RECON TOMO');
    });

    it('should return the first string of a value with VM > 1', () => {
        const elems = create(new ValueElement(Tag.ImageType, VR.CS, Value.fromString(VR.CS, 'ORIGINAL\\RECON TOMO')));
        assert.strictEqual(elems.stringByTag(Tag.ImageType), 'ORIGINAL');
        assert.strictEqual(elems.stringByPath(TagPath.fromTag(Tag.ImageType)), 'ORIGINAL');
    });

    it('should return sequences', () => {
        const s = elements.sequenceByTag(Tag.DerivationCodeSequence);
        assert(s !== undefined);
        assert.strictEqual(s.tag, Tag.DerivationCodeSequence);
        assert(elements.sequenceByTag(Tag.PatientName) === undefined);
    });

    it('should return items', () => {
        const itm = elements.itemByTag(Tag.DerivationCodeSequence, 1);
        assert(itm !== undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 0) === undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 2) !== undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 3) === undefined);
        assert.strictEqual(itm, elements.sequenceByTag(Tag.DerivationCodeSequence).item(1));
    });

    it('should return nested elements', () => {
        assert.deepStrictEqual(
            elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)),
            create(patientID1),
        );
        assert.deepStrictEqual(
            elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2)),
            create(patientID2),
        );
        assert.deepStrictEqual(
            elements.nestedByTag(Tag.DerivationCodeSequence, 1),
            elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)),
        );
    });

    it('should return deeply nested elements', () => {
        const elems = create(seq.addItem(new Item(create(seq), indeterminateLength, false)));
        assert.deepStrictEqual(
            elems.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3).thenItem(Tag.DerivationCodeSequence, 1)),
            create(patientID1),
        );
    });

    it('should return fragments', () => {
        const elems = create(
            studyDate,
            new Fragments(Tag.PixelData, VR.OB, [], [new Fragment(4, Value.fromBytes(VR.OB, [1, 2, 3, 4]))]),
        );
        assert(elems.fragmentsByTag(Tag.PixelData) !== undefined);
        assert(elems.fragmentsByTag(Tag.SeriesDate) === undefined);
        assert(elems.fragmentsByTag(Tag.StudyDate) === undefined);
    });

    it('should return elements based on tag condition', () => {
        const elements2 = create(...appendToArray(patientID3, elements.data));
        assert.deepStrictEqual(
            elements2.filter((e) => e.tag === Tag.PatientID),
            create(patientID3),
        );
    });

    it('should remove element if present', () => {
        const updatedSeq1 = new Sequence(seq.tag, seq.length, [seq.items[0], new Item(create())]);
        const updatedSeq2 = new Sequence(seq.tag, seq.length, [seq.items[0]]);
        const deepSeq = new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [
            new Item(create(patientID1)),
            new Item(create(seq)),
        ]);
        const deepElements = create(studyDate, deepSeq, patientName);
        const updatedDeepSeq = new Sequence(deepSeq.tag, deepSeq.length, [
            deepSeq.items[0],
            new Item(create(updatedSeq2)),
        ]);
        const updatedDeepElements = create(studyDate, updatedDeepSeq, patientName);

        assert.deepStrictEqual(elements.removeByTag(Tag.DerivationCodeSequence), create(studyDate, patientName));
        assert.deepStrictEqual(elements.removeByTag(Tag.PatientName), create(studyDate, seq));
        assert.deepStrictEqual(elements.removeByTag(Tag.StudyDate), create(seq, patientName));
        assert.deepStrictEqual(elements.removeByTag(Tag.Modality), elements);
        assert.deepStrictEqual(elements.removeByPath(emptyTagPath), elements);
        assert.deepStrictEqual(elements.removeByPath(TagPath.fromTag(Tag.StudyDate)), create(seq, patientName));
        assert.deepStrictEqual(
            elements.removeByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)),
            create(studyDate, new Sequence(seq.tag, seq.length, seq.items.slice(1)), patientName),
        );
        assert.deepStrictEqual(
            elements.removeByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientID)),
            create(studyDate, updatedSeq1, patientName),
        );
        assert.deepStrictEqual(elements.removeByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3)), elements);
        assert.deepStrictEqual(elements.removeByPath(TagPath.fromItem(Tag.DetectorInformationSequence, 1)), elements);
        assert.deepStrictEqual(
            deepElements.removeByPath(
                TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenItem(Tag.DerivationCodeSequence, 2),
            ),
            updatedDeepElements,
        );
    });

    it('should set elements in the correct position', () => {
        const characterSets = new ValueElement(Tag.SpecificCharacterSet, VR.CS, Value.fromString(VR.CS, 'CS1 '));
        const modality = new ValueElement(Tag.Modality, VR.CS, Value.fromString(VR.CS, 'NM'));
        assert.deepStrictEqual(elements.setElementSet(patientID3).data, [studyDate, seq, patientName, patientID3]);
        assert.deepStrictEqual(elements.setElementSet(characterSets).data, [
            characterSets,
            studyDate,
            seq,
            patientName,
        ]);
        assert.deepStrictEqual(elements.setElementSet(modality).data, [studyDate, modality, seq, patientName]);
    });

    it('should not create duplicate elements if inserted twice', () => {
        const e = Elements.empty().setString(Tag.PatientName, 'John').setString(Tag.PatientName, 'John');
        assert.equal(e.size, 1);
    });

    it('should set elements in sequences', () => {
        const updated = elements.setNestedElementSet(TagPath.fromItem(Tag.DerivationCodeSequence, 2), studyDate);
        assert.deepStrictEqual(
            updated.elementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.StudyDate)),
            studyDate,
        );
    });

    it('should not add elements to sequences that does not exist', () => {
        const updated = elements.setNestedElementSet(TagPath.fromItem(Tag.DetectorInformationSequence, 1), studyDate);
        assert.deepStrictEqual(updated, elements);
    });

    it('should replace items in sequences', () => {
        const newElements = Elements.empty().setElementSet(studyDate);
        const updated = elements.setNested(TagPath.fromItem(Tag.DerivationCodeSequence, 2), newElements);
        assert.deepStrictEqual(updated.nestedByTag(Tag.DerivationCodeSequence, 2), newElements);
    });

    it('should not add items when trying to replace item at specified index', () => {
        const newElements = Elements.empty().setElementSet(studyDate);
        const updated = elements.setNested(TagPath.fromItem(Tag.DerivationCodeSequence, 3), newElements);
        assert.deepStrictEqual(updated, elements);
        assert.deepStrictEqual(updated.nestedByTag(Tag.DerivationCodeSequence, 3), undefined);
    });

    it('should not add new sequences', () => {
        const newElements = Elements.empty().setElementSet(studyDate);
        const updated = elements.setNested(TagPath.fromItem(Tag.DetectorInformationSequence, 1), newElements);
        assert.deepStrictEqual(updated, elements);
        assert.deepStrictEqual(updated.nestedByTag(Tag.DetectorInformationSequence, 1), undefined);
    });

    it('should add an item to a sequence', () => {
        const newItem = Elements.empty().setElementSet(studyDate);
        const updated = elements.addItem(TagPath.fromSequence(Tag.DerivationCodeSequence), newItem);
        assert.deepStrictEqual(updated.nestedByTag(Tag.DerivationCodeSequence, 3), newItem);
    });

    it('should not add new sequence when adding item to a sequence that does not exist', () => {
        const newItem = Elements.empty().setElementSet(studyDate);
        const updated = elements.addItem(TagPath.fromSequence(Tag.DetectorInformationSequence), newItem);
        assert.deepStrictEqual(updated, elements);
    });

    it('should add a new sequence', () => {
        const updated = elements.setNestedSequence(
            TagPath.fromItem(Tag.DerivationCodeSequence, 1),
            new Sequence(Tag.DetectorInformationSequence, indeterminateLength, [
                new Item(Elements.empty().setElementSet(studyDate)),
            ]),
        );
        assert.deepStrictEqual(
            updated.elementByPath(
                TagPath.fromItem(Tag.DerivationCodeSequence, 1)
                    .thenItem(Tag.DetectorInformationSequence, 1)
                    .thenTag(Tag.StudyDate),
            ),
            studyDate,
        );
    });

    it('should overwrite element if already present', () => {
        const newPatientName = patientName.setValue(Value.fromString(VR.PN, 'Jane^Doe'));
        const updated = elements.setElementSet(newPatientName);

        assert.deepStrictEqual(updated.size, elements.size);
        assert.deepStrictEqual(updated.valueByTag(Tag.PatientName).bytes.toString(), 'Jane^Doe');
    });

    it('should set value', () => {
        const updated = elements.setValue(Tag.SeriesDate, VR.DA, Value.fromString(VR.DA, '20100101'));
        assert.deepStrictEqual(updated.dateByTag(Tag.SeriesDate), LocalDate.parse('2010-01-01'));
    });

    it('should set bytes', () => {
        const updated = elements.setBytes(Tag.SeriesDate, VR.DA, new Buffer('20100101'));
        assert.deepStrictEqual(updated.dateByTag(Tag.SeriesDate), LocalDate.parse('2010-01-01'));
    });

    it('should set strings', () => {
        const names = ['Smith^Dr', 'Jones^Dr'];
        assert.deepStrictEqual(
            elements.setStrings(Tag.ReferringPhysicianName, names).stringsByTag(Tag.ReferringPhysicianName),
            names,
        );
        assert.deepStrictEqual(
            elements.setString(Tag.ReferringPhysicianName, names[0]).stringsByTag(Tag.ReferringPhysicianName),
            [names[0]],
        );
    });

    it('should set numbers', () => {
        assert.deepStrictEqual(
            elements.setNumbers(Tag.ReferencedFrameNumber, [1, 2, 3]).numbersByTag(Tag.ReferencedFrameNumber),
            [1, 2, 3],
        );
        assert.deepStrictEqual(
            elements.setNumber(Tag.ReferencedFrameNumber, 42).numbersByTag(Tag.ReferencedFrameNumber),
            [42],
        );
    });

    it('should set dates', () => {
        const dates = [LocalDate.parse('2005-01-01'), LocalDate.parse('2010-01-01')];
        assert.deepStrictEqual(elements.setDates(Tag.StudyDate, dates).datesByTag(Tag.StudyDate), dates);
        assert.deepStrictEqual(elements.setDate(Tag.StudyDate, dates[0]).datesByTag(Tag.StudyDate), [dates[0]]);
    });

    it('should set times', () => {
        const times = [LocalTime.parse('23:30:10'), LocalTime.parse('12:00:00')];
        assert.deepStrictEqual(elements.setTimes(Tag.AcquisitionTime, times).timesByTag(Tag.AcquisitionTime), times);
        assert.deepStrictEqual(elements.setTime(Tag.AcquisitionTime, times[0]).timesByTag(Tag.AcquisitionTime), [
            times[0],
        ]);
    });

    it('should set date times', () => {
        const dateTimes = [LocalDate.parse('2005-01-01'), LocalDate.parse('2010-01-01')].map((d) =>
            d.atStartOfDay(ZoneOffset.of('+04:00')),
        );
        assert.deepStrictEqual(
            elements.setDateTimes(Tag.InstanceCoercionDateTime, dateTimes).dateTimesByTag(Tag.InstanceCoercionDateTime),
            dateTimes,
        );
        assert.deepStrictEqual(
            elements
                .setDateTime(Tag.InstanceCoercionDateTime, dateTimes[0])
                .dateTimesByTag(Tag.InstanceCoercionDateTime),
            [dateTimes[0]],
        );
    });

    it('should set patient names', () => {
        const names = ['Doe^John', 'Doe^Jane'];
        const personNames = flatten(names.map(PersonName.parse));
        assert.deepStrictEqual(
            elements.setPersonNames(Tag.PatientName, personNames).personNamesByTag(Tag.PatientName),
            personNames,
        );
        assert.deepStrictEqual(
            elements.setPersonName(Tag.PatientName, personNames[0]).personNamesByTag(Tag.PatientName),
            [personNames[0]],
        );
    });

    it('should set URL', () => {
        const url = new URL('https://example.com:8080/path?q1=45');
        assert.deepStrictEqual(elements.setURL(Tag.StorageURL, url).urlByTag(Tag.StorageURL), url);
    });

    it('should update character sets', () => {
        const updatedCs1 = elements.setCharacterSets(CharacterSets.fromBytes(new Buffer('\\ISO 2022 IR 127')))
            .characterSets;
        assert.equal(updatedCs1.charsets.trim(), '\\ISO 2022 IR 127');
        const updatedCs2 = elements.setElementSet(
            new ValueElement(Tag.SpecificCharacterSet, VR.CS, Value.fromString(VR.CS, '\\ISO 2022 IR 13')),
        ).characterSets;
        assert.equal(updatedCs2.charsets.trim(), '\\ISO 2022 IR 13');
    });

    it('should update zone offset', () => {
        const updatedZo1 = elements.setZoneOffset(ZoneOffset.of('-06:00')).zoneOffset;
        assert.equal(updatedZo1.toString(), '-06:00');
        const updatedZo2 = elements.setElementSet(
            new ValueElement(Tag.TimezoneOffsetFromUTC, VR.SH, Value.fromString(VR.SH, '+04:00')),
        ).zoneOffset;
        assert.equal(updatedZo2.toString(), '+04:00');
        const updatedZo3 = elements.setElementSet(
            new ValueElement(Tag.TimezoneOffsetFromUTC, VR.SH, Value.fromString(VR.SH, 'bad zone offset string')),
        ).zoneOffset;
        assert.deepStrictEqual(updatedZo3, elements.zoneOffset);
    });

    it('should set sequence', () => {
        const e1 = Elements.empty().setString(Tag.PatientName, 'Last1^First1');
        const e2 = Elements.empty().setString(Tag.PatientName, 'Last2^First2');
        const i1 = new Item(e1);
        const i2 = new Item(e2);
        const s = new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [i1, i2]);

        assert.deepStrictEqual(s, new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [i1, i2]));
        assert.deepStrictEqual(s.items.length, 2);
        assert.deepStrictEqual(s.items[1], i2);

        const updated = elements.setSequence(s);
        assert.deepStrictEqual(updated, elements.setElementSet(s));
        assert.deepStrictEqual(updated.contains(Tag.DerivationCodeSequence), true);
        assert.deepStrictEqual(updated.sequenceByTag(Tag.DerivationCodeSequence), s);
    });

    it('should aggregate the bytes of all its elements', () => {
        const bytes = concatv(
            data.preamble,
            data.element(Tag.StudyDate, '20041230'),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.element(Tag.PatientID, '12345678'),
            itemDelimitation(),
            item(),
            data.element(Tag.PatientID, '87654321'),
            itemDelimitation(),
            sequenceDelimitation(),
            data.element(Tag.PatientName, 'John^Doe'),
        );

        assert.deepStrictEqual(elements.toBytes(), bytes);
    });

    it('should return an empty byte string when aggregating bytes with no data', () => {
        assert.deepStrictEqual(create().toBytes(false), emptyBuffer);
    });

    it('should render an informative string representation', () => {
        const s = elements.toString();
        assert.strictEqual(s.split(/\n/).length, 10);
    });

    it('should return the specified element based on tag path', () => {
        assert.strictEqual(
            elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientID)),
            patientID2,
        );
        assert(
            elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3).thenTag(Tag.PatientID)) ===
                undefined,
        );
        assert(
            elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3).thenTag(Tag.PatientID)) ===
                undefined,
        );
        assert(
            elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientName)) ===
                undefined,
        );
        assert(
            elements.valueElementByPath(TagPath.fromItem(Tag.AbstractPriorCodeSequence, 1).thenTag(Tag.PatientID)) ===
                undefined,
        );
    });

    it('should return the specified seqeunce based on tag path', () => {
        assert.strictEqual(
            elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)),
            seq.item(1).elements,
        );
    });

    it('should return numbers', () => {
        const elems = create(new ValueElement(Tag.ReferencedFrameNumber, VR.IS, Value.fromString(VR.IS, '1\\2\\3')));
        assert.deepStrictEqual(elems.numbersByTag(Tag.ReferencedFrameNumber), [1, 2, 3]);
        assert.strictEqual(elems.numberByTag(Tag.ReferencedFrameNumber), 1);
        assert.deepStrictEqual(elems.numbersByPath(TagPath.fromTag(Tag.ReferencedFrameNumber)), [1, 2, 3]);
        assert.strictEqual(elems.numberByPath(TagPath.fromTag(Tag.ReferencedFrameNumber)), 1);
    });

    it('should return dates', () => {
        const dates = [LocalDate.parse('2005-01-01'), LocalDate.parse('2010-01-01')];
        const elems = create(new ValueElement(Tag.StudyDate, VR.DA, Value.fromDates(VR.DA, dates)));
        assert.deepStrictEqual(elems.datesByTag(Tag.StudyDate), dates);
        assert.deepStrictEqual(elems.dateByTag(Tag.StudyDate), dates[0]);
        assert.deepStrictEqual(elems.datesByPath(TagPath.fromTag(Tag.StudyDate)), dates);
        assert.deepStrictEqual(elems.dateByPath(TagPath.fromTag(Tag.StudyDate)), dates[0]);
    });

    it('should return times', () => {
        const times = [LocalTime.parse('22:30:10'), LocalTime.parse('12:00:00')];
        const elems = create(new ValueElement(Tag.AcquisitionTime, VR.TM, Value.fromTimes(VR.TM, times)));
        assert.deepStrictEqual(elems.timesByTag(Tag.AcquisitionTime), times);
        assert.deepStrictEqual(elems.timeByTag(Tag.AcquisitionTime), times[0]);
        assert.deepStrictEqual(elems.timesByPath(TagPath.fromTag(Tag.AcquisitionTime)), times);
        assert.deepStrictEqual(elems.timeByPath(TagPath.fromTag(Tag.AcquisitionTime)), times[0]);
    });

    it('should return date times', () => {
        const dateTimes = [LocalDate.parse('2005-01-01'), LocalDate.parse('2010-01-01')].map((dt) =>
            dt.atStartOfDay(ZoneOffset.ofHoursMinutes(4, 0)),
        );
        const elems = create(
            new ValueElement(Tag.TimezoneOffsetFromUTC, VR.SH, Value.fromString(VR.SH, '+04:00')),
            new ValueElement(Tag.InstanceCoercionDateTime, VR.DT, Value.fromDateTimes(VR.DT, dateTimes)),
        );
        assert.deepStrictEqual(elems.dateTimesByTag(Tag.InstanceCoercionDateTime), dateTimes);
        assert.deepStrictEqual(elems.dateTimeByTag(Tag.InstanceCoercionDateTime), dateTimes[0]);
        assert.deepStrictEqual(elems.dateTimesByPath(TagPath.fromTag(Tag.InstanceCoercionDateTime)), dateTimes);
        assert.deepStrictEqual(elems.dateTimeByPath(TagPath.fromTag(Tag.InstanceCoercionDateTime)), dateTimes[0]);
    });

    it('should return person names', () => {
        const names = ['Doe^John', 'Doe^Jane'];
        const personNames = flatten(names.map(PersonName.parse));
        const e = create(new ValueElement(Tag.PatientName, VR.PN, Value.fromString(VR.PN, names.join('\\'))));
        assert.deepStrictEqual(e.personNamesByTag(Tag.PatientName), personNames);
        assert.deepStrictEqual(e.personNameByTag(Tag.PatientName), personNames[0]);
        assert.deepStrictEqual(e.personNamesByPath(TagPath.fromTag(Tag.PatientName)), personNames);
        assert.deepStrictEqual(e.personNameByPath(TagPath.fromTag(Tag.PatientName)), personNames[0]);
    });
});

describe('Elements data classes', () => {
    it('should return the correct byte representation', () => {
        assert.strictEqual(preambleElement.toBytes().length, 128 + 4);
        assert.strictEqual(preambleElement.toBytes().slice(128).toString(), 'DICM');
        assert.deepStrictEqual(
            new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20010101')).toBytes(),
            concat(HeaderPart.create(Tag.StudyDate, VR.DA, 8).bytes, Buffer.from('20010101')),
        );
        assert.deepStrictEqual(
            new SequenceElement(Tag.DerivationCodeSequence, 10).toBytes(),
            data.sequence(Tag.DerivationCodeSequence, 10),
        );
        assert.deepStrictEqual(new FragmentsElement(Tag.PixelData, VR.OW).toBytes(), data.pixeDataFragments());
        assert.deepStrictEqual(
            new FragmentElement(1, 4, Value.fromBytes(VR.OW, [1, 2, 3, 4])).toBytes(),
            concat(item(4), Buffer.from([1, 2, 3, 4])),
        );
        assert.deepStrictEqual(new ItemElement(1, 10).toBytes(), item(10));
        assert.deepStrictEqual(new ItemDelimitationElement(1).toBytes(), itemDelimitation());
        assert.deepStrictEqual(new SequenceDelimitationElement().toBytes(), sequenceDelimitation());
        assert.deepStrictEqual(
            new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [
                new Item(create(), indeterminateLength),
            ]).toBytes(),
            concatv(data.sequence(Tag.DerivationCodeSequence), item(), itemDelimitation(), sequenceDelimitation()),
        );
        assert.deepStrictEqual(
            new Fragments(Tag.PixelData, VR.OW, [], [new Fragment(4, Value.fromBytes(VR.OW, [1, 2, 3, 4]))]).toBytes(),
            concatv(data.pixeDataFragments(), item(0), item(4), Buffer.from([1, 2, 3, 4]), sequenceDelimitation()),
        );
    });

    it('should have expected string representations in terms of number of lines', () => {
        const checkString = (s: string, nLines: number): void => {
            return assert.strictEqual(s.split(/\n/).length, nLines);
        };

        checkString(preambleElement.toString(), 1);
        checkString(new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20010101')).toString(), 1);
        checkString(new SequenceElement(Tag.DerivationCodeSequence, 10).toString(), 1);
        checkString(new FragmentsElement(Tag.PixelData, VR.OW).toString(), 1);
        checkString(new FragmentElement(1, 4, Value.fromBytes(VR.OW, [1, 2, 3, 4])).toString(), 1);
        checkString(new ItemElement(1, 10).toString(), 1);
        checkString(new ItemDelimitationElement(1).toString(), 1);
        checkString(new SequenceDelimitationElement().toString(), 1);
        checkString(
            new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [
                new Item(create(), indeterminateLength),
            ]).toString(),
            1,
        );
        checkString(
            new Fragments(Tag.PixelData, VR.OW, [], [new Fragment(4, Value.fromBytes(VR.OW, [1, 2, 3, 4]))]).toString(),
            1,
        );
    });
});
