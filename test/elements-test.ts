import assert from "assert";
import {LocalDate, LocalTime, ZoneOffset} from "js-joda";
import {
    appendToArray, concat, concatv, defaultCharacterSet, emptyBuffer, indeterminateLength, item,
    itemDelimitation, sequenceDelimitation, systemZone,
} from "../src/base";
import {Elements, ElementSet, Fragment, FragmentElement, Fragments, FragmentsElement, Item,
    ItemDelimitationElement, ItemElement, preambleElement, Sequence, SequenceDelimitationElement,
    SequenceElement, ValueElement,
} from "../src/elements";
import {HeaderPart} from "../src/parts";
import {Tag} from "../src/tag";
import {TagPath} from "../src/tag-path";
import {Value} from "../src/value";
import {VR} from "../src/vr";
import * as data from "./test-data";

function create(...elems: ElementSet[]) {
    return elems.reduce((e, s) => e.setElementSet(s), Elements.empty());
}

const studyDate = new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, "20041230"));
const patientName = new ValueElement(Tag.PatientName, VR.PN, Value.fromString(VR.PN, "John^Doe"));
const patientID1 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, "12345678"));
const patientID2 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, "87654321"));
const patientID3 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, "18273645"));
const seq = new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [
    new Item(create(patientID1), indeterminateLength, false),
    new Item(create(patientID2), indeterminateLength, false),
]);

const elements = create(studyDate, seq, patientName);

describe("Elements", () => {

    it("should return an existing element", () => {
        assert.strictEqual(elements.valueElementByTag(Tag.PatientName), patientName);
        assert.strictEqual(elements.valueElementByPath(TagPath.fromTag(Tag.PatientName)), patientName);
        assert.strictEqual(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)
            .thenTag(Tag.PatientID)), patientID1);
        assert.strictEqual(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2)
            .thenTag(Tag.PatientID)), patientID2);
    });

    it("should support empty and contains tests", () => {
        assert(!elements.isEmpty());
        assert(elements.nonEmpty());
        assert(elements.contains(Tag.StudyDate));
        assert(elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1)));
        assert(!elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 3)));
        assert(elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientID)));
        assert(!elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName)));
        assert.strictEqual(elements.head(), studyDate);
    });

    it("should support sorting elements", () => {
        const unsorted = new Elements(defaultCharacterSet, systemZone, [patientName, studyDate]);
        assert.strictEqual(unsorted.head(), patientName);
        const sorted = unsorted.sorted();
        assert.strictEqual(sorted.head(), studyDate);
        assert.strictEqual(unsorted.head(), patientName); // check immutable
    });

    it("should return undefined for missing element", () => {
        assert.strictEqual(elements.valueByTag(Tag.SeriesDate), undefined);
    });

    it("should return value elements only", () => {
        assert.strictEqual(elements.valueElementByTag(Tag.PatientName), patientName);
        assert.strictEqual(elements.valueElementByPath(TagPath.fromTag(Tag.PatientName)), patientName);
        assert.strictEqual(elements.valueElementByTag(Tag.SeriesDate), undefined);
        assert.strictEqual(elements.valueElementByTag(Tag.DerivationCodeSequence), undefined);
    });

    it("should return the value of an element", () => {
        const value = elements.valueByTag(Tag.PatientName);
        assert(value !== undefined);
        assert(value.length > 0);
        assert(elements.valueByTag(Tag.SeriesDate) === undefined);
        assert(elements.valueByPath(TagPath.fromTag(Tag.PatientName)) !== undefined);
    });

    it("should return the bytes of an element", () => {
        assert(elements.bytesByTag(Tag.PatientName) !== undefined);
        assert(elements.bytesByPath(TagPath.fromTag(Tag.PatientName)) !== undefined);
    });

    it("should return all strings in value with VM > 1", () => {
        const elems = create(new ValueElement(Tag.ImageType, VR.CS,
                Value.fromString(VR.CS, "ORIGINAL\\RECON TOMO")), seq);
        const strings = elems.stringsByTag(Tag.ImageType);
        assert.strictEqual(strings.length, 2);
        assert.strictEqual(strings[1], "RECON TOMO");
        assert.strictEqual(elems.stringsByPath(TagPath.fromTag(Tag.ImageType)).length, 2);
        assert.strictEqual(elems.stringsByTag(Tag.SeriesDate).length, 0);
        assert.strictEqual(elems.stringsByTag(Tag.DerivationCodeSequence).length, 0);
    });

    it("should return a concatenated string in value with VM > 1", () => {
        const elems = create(new ValueElement(Tag.ImageType, VR.CS,
            Value.fromString(VR.CS, "ORIGINAL\\RECON TOMO")));
        assert.strictEqual(elems.singleStringByTag(Tag.ImageType), "ORIGINAL\\RECON TOMO");
        assert.strictEqual(elems.singleStringByPath(TagPath.fromTag(Tag.ImageType)), "ORIGINAL\\RECON TOMO");
    });

    it("should return the first string of a value with VM > 1", () => {
        const elems = create(new ValueElement(Tag.ImageType, VR.CS,
            Value.fromString(VR.CS, "ORIGINAL\\RECON TOMO")));
        assert.strictEqual(elems.stringByTag(Tag.ImageType), "ORIGINAL");
        assert.strictEqual(elems.stringByPath(TagPath.fromTag(Tag.ImageType)), "ORIGINAL");
    });

    it("should return sequences", () => {
        const s = elements.sequenceByTag(Tag.DerivationCodeSequence);
        assert(s !== undefined);
        assert.strictEqual(s.tag, Tag.DerivationCodeSequence);
        assert(elements.sequenceByTag(Tag.PatientName) === undefined);
    });

    it("should return items", () => {
        const itm = elements.itemByTag(Tag.DerivationCodeSequence, 1);
        assert(itm !== undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 0) === undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 2) !== undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 3) === undefined);
        assert.strictEqual(itm, elements.sequenceByTag(Tag.DerivationCodeSequence).item(1));
    });

    it("should return nested elements", () => {
        assert.deepStrictEqual(elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)),
            create(patientID1));
        assert.deepStrictEqual(elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2)),
            create(patientID2));
        assert.deepStrictEqual(elements.nestedByTag(Tag.DerivationCodeSequence, 1),
            elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)));
    });

    it("should return deeply nested elements", () => {
        const elems = create(seq.addItem(new Item(create(seq), indeterminateLength, false)));
        assert.deepStrictEqual(elems.nestedByPath(TagPath
            .fromItem(Tag.DerivationCodeSequence, 3)
            .thenItem(Tag.DerivationCodeSequence, 1)), create(patientID1));
    });

    it("should return fragments", () => {
        const elems = create(studyDate,
            new Fragments(Tag.PixelData, VR.OB, [], [new Fragment(4, Value.fromBytes(VR.OB, [1, 2, 3, 4]))]));
        assert(elems.fragmentsByTag(Tag.PixelData) !== undefined);
        assert(elems.fragmentsByTag(Tag.SeriesDate) === undefined);
        assert(elems.fragmentsByTag(Tag.StudyDate) === undefined);
    });

    it("should return elements based on tag condition", () => {
        const elements2 = create(...appendToArray(patientID3, elements.data));
        assert.deepStrictEqual(elements2.filter((e) => e.tag === Tag.PatientID), create(patientID3));
    });

    it("should aggregate the bytes of all its elements", () => {
        const bytes = concatv(data.preamble,
        data.element(Tag.StudyDate, "20041230"),
        data.sequence(Tag.DerivationCodeSequence),
        item(), data.element(Tag.PatientID, "12345678"), itemDelimitation(),
        item(), data.element(Tag.PatientID, "87654321"), itemDelimitation(),
        sequenceDelimitation(),
        data.element(Tag.PatientName, "John^Doe"));

        assert.deepStrictEqual(elements.toBytes(), bytes);
    });

    it("should return an empty byte string when aggregating bytes with no data", () => {
        assert.deepStrictEqual(create().toBytes(false), emptyBuffer);
    });

    it("should render an informative string representation", () => {
        const s = elements.toString();
        assert.strictEqual(s.split(/\n/).length, 10);
    });

    it("should return the specified element based on tag path", () => {
        assert.strictEqual(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2)
            .thenTag(Tag.PatientID)), patientID2);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3)
            .thenTag(Tag.PatientID)) === undefined);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3)
            .thenTag(Tag.PatientID)) === undefined);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2)
            .thenTag(Tag.PatientName)) === undefined);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.AbstractPriorCodeSequence, 1)
            .thenTag(Tag.PatientID)) === undefined);
    });

    it("should return the specified seqeunce based on tag path", () => {
        assert.strictEqual(elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)),
            seq.item(1).elements);
    });

    it("should return numbers", () => {
        const elems = create(new ValueElement(Tag.ReferencedFrameNumber, VR.IS, Value.fromString(VR.IS, "1\\2\\3")));
        assert.deepStrictEqual(elems.numbersByTag(Tag.ReferencedFrameNumber), [1, 2, 3]);
        assert.strictEqual(elems.numberByTag(Tag.ReferencedFrameNumber), 1);
        assert.deepStrictEqual(elems.numbersByPath(TagPath.fromTag(Tag.ReferencedFrameNumber)), [1, 2, 3]);
        assert.strictEqual(elems.numberByPath(TagPath.fromTag(Tag.ReferencedFrameNumber)), 1);
    });

    it("should return dates", () => {
        const dates = [LocalDate.parse("2005-01-01"), LocalDate.parse("2010-01-01")];
        const elems = create(new ValueElement(Tag.StudyDate, VR.DA, Value.fromDates(VR.DA, dates)));
        assert.deepStrictEqual(elems.datesByTag(Tag.StudyDate), dates);
        assert.deepStrictEqual(elems.dateByTag(Tag.StudyDate), dates[0]);
        assert.deepStrictEqual(elems.datesByPath(TagPath.fromTag(Tag.StudyDate)), dates);
        assert.deepStrictEqual(elems.dateByPath(TagPath.fromTag(Tag.StudyDate)), dates[0]);
    });

    it("should return times", () => {
        const times = [LocalTime.parse("22:30:10"), LocalTime.parse("12:00:00")];
        const elems = create(new ValueElement(Tag.AcquisitionTime, VR.TM, Value.fromTimes(VR.TM, times)));
        assert.deepStrictEqual(elems.timesByTag(Tag.AcquisitionTime), times);
        assert.deepStrictEqual(elems.timeByTag(Tag.AcquisitionTime), times[0]);
        assert.deepStrictEqual(elems.timesByPath(TagPath.fromTag(Tag.AcquisitionTime)), times);
        assert.deepStrictEqual(elems.timeByPath(TagPath.fromTag(Tag.AcquisitionTime)), times[0]);
    });

    it("should return date times", () => {
        const dateTimes = [LocalDate.parse("2005-01-01"), LocalDate.parse("2010-01-01")]
            .map((dt) => dt.atStartOfDay(ZoneOffset.ofHoursMinutes(4, 0)));
        const elems = create(
            new ValueElement(Tag.TimezoneOffsetFromUTC, VR.SH, Value.fromString(VR.SH, "+0400")),
            new ValueElement(Tag.InstanceCoercionDateTime, VR.DT, Value.fromDateTimes(VR.DT, dateTimes)));
        assert.deepStrictEqual(elems.dateTimesByTag(Tag.InstanceCoercionDateTime), dateTimes);
        assert.deepStrictEqual(elems.dateTimeByTag(Tag.InstanceCoercionDateTime), dateTimes[0]);
        assert.deepStrictEqual(elems.dateTimesByPath(TagPath.fromTag(Tag.InstanceCoercionDateTime)), dateTimes);
        assert.deepStrictEqual(elems.dateTimeByPath(TagPath.fromTag(Tag.InstanceCoercionDateTime)), dateTimes[0]);
    });

});

describe("Elements data classes", () => {

    it("should return the correct byte representation", () => {
        assert.strictEqual(preambleElement.toBytes().length, 128 + 4);
        assert.strictEqual(preambleElement.toBytes().slice(128).toString(), "DICM");
        assert.deepStrictEqual(new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, "20010101")).toBytes(),
            concat(HeaderPart.create(Tag.StudyDate, VR.DA, 8).bytes, Buffer.from("20010101")));
        assert.deepStrictEqual(new SequenceElement(Tag.DerivationCodeSequence, 10).toBytes(),
            data.sequence(Tag.DerivationCodeSequence, 10));
        assert.deepStrictEqual(new FragmentsElement(Tag.PixelData, VR.OW).toBytes(), data.pixeDataFragments());
        assert.deepStrictEqual(new FragmentElement(1, 4, Value.fromBytes(VR.OW, [1, 2, 3, 4])).toBytes(),
            concat(item(4), Buffer.from([1, 2, 3, 4])));
        assert.deepStrictEqual(new ItemElement(1, 10).toBytes(), item(10));
        assert.deepStrictEqual(new ItemDelimitationElement(1).toBytes(), itemDelimitation());
        assert.deepStrictEqual(new SequenceDelimitationElement().toBytes(), sequenceDelimitation());
        assert.deepStrictEqual(new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [new Item(create(),
            indeterminateLength)]).toBytes(), concatv(data.sequence(Tag.DerivationCodeSequence), item(),
            itemDelimitation(), sequenceDelimitation()));
        assert.deepStrictEqual(new Fragments(Tag.PixelData, VR.OW, [],
            [new Fragment(4, Value.fromBytes(VR.OW, [1, 2, 3, 4]))]).toBytes(), concatv(data.pixeDataFragments(),
                item(0), item(4), Buffer.from([1, 2, 3, 4]), sequenceDelimitation()));
    });

    it("should have expected string representations in terms of number of lines", () => {
        const checkString = (s: string, nLines: number) => {
            return assert.strictEqual(s.split(/\n/).length, nLines);
        };

        checkString(preambleElement.toString(), 1);
        checkString(new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, "20010101")).toString(), 1);
        checkString(new SequenceElement(Tag.DerivationCodeSequence, 10).toString(), 1);
        checkString(new FragmentsElement(Tag.PixelData, VR.OW).toString(), 1);
        checkString(new FragmentElement(1, 4, Value.fromBytes(VR.OW, [1, 2, 3, 4])).toString(), 1);
        checkString(new ItemElement(1, 10).toString(), 1);
        checkString(new ItemDelimitationElement(1).toString(), 1);
        checkString(new SequenceDelimitationElement().toString(), 1);
        checkString(new Sequence(Tag.DerivationCodeSequence, indeterminateLength, [new Item(create(),
            indeterminateLength)]).toString(), 1);
        checkString(new Fragments(Tag.PixelData, VR.OW, [],
            [new Fragment(4, Value.fromBytes(VR.OW, [1, 2, 3, 4]))]).toString(), 1);
    });

});
