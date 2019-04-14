const assert = require("assert");
const joda = require("js-joda");
const base = require("../src/base");
const {Value} = require("../src/value");
const Tag = require("../src/tag");
const {TagPath} = require("../src/tag-path");
const {HeaderPart} = require("../src/parts");
const {Elements, ValueElement, Sequence, Item, Fragment, Fragments, preambleElement, SequenceElement, FragmentElement,
    FragmentsElement, ItemElement, ItemDelimitationElement, SequenceDelimitationElement} = require("../src/elements");
const VR = require("../src/vr");
const data = require("./test-data");

function create(...elements) {
    return new Elements(base.defaultCharacterSet, base.systemZone, elements);
}

const studyDate = new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA,"20041230"));
const patientName = new ValueElement(Tag.PatientName, VR.PN, Value.fromString(VR.PN, "John^Doe"));
const patientID1 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, "12345678"));
const patientID2 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, "87654321"));
const patientID3 = new ValueElement(Tag.PatientID, VR.LO, Value.fromString(VR.LO, "18273645"));
const seq = new Sequence(Tag.DerivationCodeSequence, base.indeterminateLength, [
    new Item(create(patientID1), base.indeterminateLength, false),
    new Item(create(patientID2), base.indeterminateLength, false)
]);

const elements = create(studyDate, seq, patientName);

describe("Elements", function () {

    it("should return an existing element", function () {
        assert.equal(elements.valueElementByTag(Tag.PatientName), patientName);
        assert.equal(elements.valueElementByPath(TagPath.fromTag(Tag.PatientName)), patientName);
        assert.equal(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientID)), patientID1);
        assert.equal(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientID)), patientID2);
    });

    it("should support empty and contains tests", function () {
        assert(!elements.isEmpty());
        assert(elements.nonEmpty());
        assert(elements.contains(Tag.StudyDate));
        assert(elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1)));
        assert(!elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 3)));
        assert(elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientID)));
        assert(!elements.contains(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName)));
        assert.equal(elements.head(), studyDate);
    });

    it("should support sorting elements", function() {
        let unsorted = create(patientName, studyDate);
        assert.equal(unsorted.head(), patientName);
        let sorted = unsorted.sorted();
        assert.equal(sorted.head(), studyDate);
        assert.equal(unsorted.head(), patientName); // check immutable
    });

    it("should return undefined for missing element", function() {
        assert.equal(elements.valueByTag(Tag.SeriesDate), undefined)
    });

    it("should return value elements only", function () {
        assert.equal(elements.valueElementByTag(Tag.PatientName), patientName);
        assert.equal(elements.valueElementByPath(TagPath.fromTag(Tag.PatientName)), patientName);
        assert.equal(elements.valueElementByTag(Tag.SeriesDate), undefined);
        assert.equal(elements.valueElementByTag(Tag.DerivationCodeSequence), undefined);
    });

    it("should return the value of an element", function () {
        let value = elements.valueByTag(Tag.PatientName);
        assert(value !== undefined);
        assert(value.length > 0);
        assert(elements.valueByTag(Tag.SeriesDate) === undefined);
        assert(elements.valueByPath(TagPath.fromTag(Tag.PatientName)) !== undefined)
    });

    it("should return the bytes of an element", function () {
        assert(elements.bytesByTag(Tag.PatientName) !== undefined);
        assert(elements.bytesByPath(TagPath.fromTag(Tag.PatientName)) !== undefined);
    });

    it("should return all strings in value with VM > 1", function () {
        let elements = create(new ValueElement(Tag.ImageType, VR.CS, Value.fromString(VR.CS,"ORIGINAL\\RECON TOMO")), seq);
        let strings = elements.stringsByTag(Tag.ImageType);
        assert.equal(strings.length, 2);
        assert.equal(strings[1], "RECON TOMO");
        assert.equal(elements.stringsByPath(TagPath.fromTag(Tag.ImageType)).length, 2);
        assert.equal(elements.stringsByTag(Tag.SeriesDate), 0);
        assert.equal(elements.stringsByTag(Tag.DerivationCodeSequence), 0);
    });

    it("should return a concatenated string in value with VM > 1", function () {
        let elements = create(new ValueElement(Tag.ImageType, VR.CS, Value.fromString(VR.CS,"ORIGINAL\\RECON TOMO")));
        assert.equal(elements.singleStringByTag(Tag.ImageType), "ORIGINAL\\RECON TOMO");
        assert.equal(elements.singleStringByPath(TagPath.fromTag(Tag.ImageType)), "ORIGINAL\\RECON TOMO");
    });

    it("should return the first string of a value with VM > 1", function () {
        let elements = create(new ValueElement(Tag.ImageType, VR.CS, Value.fromString(VR.CS,"ORIGINAL\\RECON TOMO")));
        assert.equal(elements.stringByTag(Tag.ImageType), "ORIGINAL");
        assert.equal(elements.stringByPath(TagPath.fromTag(Tag.ImageType)), "ORIGINAL");
    });

    it("should return sequences", function () {
        let seq = elements.sequenceByTag(Tag.DerivationCodeSequence);
        assert(seq !== undefined);
        assert.equal(seq.tag, Tag.DerivationCodeSequence);
        assert(elements.sequenceByTag(Tag.PatientName) === undefined);
    });

    it("should return items", function () {
        let item = elements.itemByTag(Tag.DerivationCodeSequence, 1);
        assert(item !== undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 0) === undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 2) !== undefined);
        assert(elements.itemByTag(Tag.DerivationCodeSequence, 3) === undefined);
        assert.equal(item, elements.sequenceByTag(Tag.DerivationCodeSequence).item(1));
    });

    it("should return nested elements", function () {
        assert.deepEqual(elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)), create(patientID1));
        assert.deepEqual(elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2)), create(patientID2));
        assert.deepEqual(elements.nestedByTag(Tag.DerivationCodeSequence, 1), elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)));
    });

    it("should return deeply nested elements", function () {
        let elements = create(seq.addItem(new Item(create(seq)), base.indeterminateLength, false));
        assert.deepEqual(elements.nestedByPath(TagPath
            .fromItem(Tag.DerivationCodeSequence, 3)
            .thenItem(Tag.DerivationCodeSequence, 1)), create(patientID1));
    });

    it("should return fragments", function () {
        let elements = create(studyDate, new Fragments(Tag.PixelData, VR.OB, [new Fragment(4, Value.fromBytes(VR.OB,[1, 2, 3, 4]))]));
        assert(elements.fragmentsByTag(Tag.PixelData) !== undefined);
        assert(elements.fragmentsByTag(Tag.SeriesDate) === undefined);
        assert(elements.fragmentsByTag(Tag.StudyDate) === undefined);
    });

    it("should return elements based on tag condition", function () {
        let elements2 = create(...base.appendToArray(patientID3, elements.data));
        assert.deepEqual(elements2.filter(e => e.tag === Tag.PatientID), create(patientID3));
    });

    it("should aggregate the bytes of all its elements", function () {
        let bytes = base.concatv(data.preamble,
        data.element(Tag.StudyDate, "20041230"),
        data.sequence(Tag.DerivationCodeSequence),
        base.item(), data.element(Tag.PatientID, "12345678"), base.itemDelimitation(),
        base.item(), data.element(Tag.PatientID, "87654321"), base.itemDelimitation(),
        base.sequenceDelimitation(),
        data.element(Tag.PatientName, "John^Doe"));

        assert.deepEqual(elements.toBytes(), bytes);
    });

    it("should return an empty byte string when aggregating bytes with no data", function () {
        assert.deepEqual(create().toBytes(false), base.emptyBuffer);
    });

    it("should render an informative string representation", function () {
        let s = elements.toString();
        assert.equal(s.split(/\n/).length, 10);
    });

    it("should return the specified element based on tag path", function () {
        assert.equal(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientID)), patientID2);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3).thenTag(Tag.PatientID)) === undefined);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 3).thenTag(Tag.PatientID)) === undefined);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientName)) === undefined);
        assert(elements.valueElementByPath(TagPath.fromItem(Tag.AbstractPriorCodeSequence, 1).thenTag(Tag.PatientID)) === undefined);
    });

    it("should return the specified seqeunce based on tag path", function () {
        assert.equal(elements.nestedByPath(TagPath.fromItem(Tag.DerivationCodeSequence, 1)), seq.item(1).elements);
    });

    it("should return dates", function () {
        let dates = [joda.LocalDate.parse("2005-01-01"), joda.LocalDate.parse("2010-01-01")];
        let elements = create(new ValueElement(Tag.StudyDate, VR.DA, Value.fromDates(VR.DA, dates)));
        assert.deepEqual(elements.datesByTag(Tag.StudyDate), dates);
        assert.deepEqual(elements.dateByTag(Tag.StudyDate), dates[0]);
        assert.deepEqual(elements.datesByPath(TagPath.fromTag(Tag.StudyDate)), dates);
        assert.deepEqual(elements.dateByPath(TagPath.fromTag(Tag.StudyDate)), dates[0]);
    });

    it("should return times", function() {
        let times = [joda.LocalTime.parse("22:30:10"), joda.LocalTime.parse("12:00:00")];
        let elements = create(new ValueElement(Tag.AcquisitionTime, VR.TM, Value.fromTimes(VR.TM, times)));
        assert.deepEqual(elements.timesByTag(Tag.AcquisitionTime), times);
        assert.deepEqual(elements.timeByTag(Tag.AcquisitionTime), times[0]);
        assert.deepEqual(elements.timesByPath(TagPath.fromTag(Tag.AcquisitionTime)), times);
        assert.deepEqual(elements.timeByPath(TagPath.fromTag(Tag.AcquisitionTime)), times[0]);
    });

    it("should return date times", function () {
        let dateTimes = [joda.LocalDate.parse("2005-01-01"), joda.LocalDate.parse("2010-01-01")]
            .map(dt => dt.atStartOfDay(joda.ZoneOffset.ofHoursMinutes(4,0)));
        let elements = create(new ValueElement(Tag.InstanceCoercionDateTime, VR.DT, Value.fromDateTimes(VR.DT, dateTimes)));
        assert.deepEqual(elements.dateTimesByTag(Tag.InstanceCoercionDateTime), dateTimes);
        assert.deepEqual(elements.dateTimeByTag(Tag.InstanceCoercionDateTime), dateTimes[0]);
        assert.deepEqual(elements.dateTimesByPath(TagPath.fromTag(Tag.InstanceCoercionDateTime)), dateTimes);
        assert.deepEqual(elements.dateTimeByPath(TagPath.fromTag(Tag.InstanceCoercionDateTime)), dateTimes[0]);
    });

});

describe("Elements data classes", function () {

    it("should return the correct byte representation", function () {
        assert.equal(preambleElement.toBytes().length, 128 + 4);
        assert.equal(preambleElement.toBytes().slice(128).toString(), "DICM");
        assert.deepEqual(new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, "20010101")).toBytes(), base.concat(new HeaderPart(Tag.StudyDate, VR.DA, 8).bytes, Buffer.from("20010101")));
        assert.deepEqual(new SequenceElement(Tag.DerivationCodeSequence, 10).toBytes(), data.sequence(Tag.DerivationCodeSequence, 10));
        assert.deepEqual(new FragmentsElement(Tag.PixelData, VR.OW).toBytes(), data.pixeDataFragments());
        assert.deepEqual(new FragmentElement(1, 4, Value.fromBytes(VR.OW,[1, 2, 3, 4])).toBytes(), base.concat(base.item(4), Buffer.from([1, 2, 3, 4])));
        assert.deepEqual(new ItemElement(1, 10).toBytes(), base.item(10));
        assert.deepEqual(new ItemDelimitationElement(1).toBytes(), base.itemDelimitation());
        assert.deepEqual(new SequenceDelimitationElement().toBytes(), base.sequenceDelimitation());
        assert.deepEqual(new Sequence(Tag.DerivationCodeSequence, base.indeterminateLength, [new Item(create(), base.indeterminateLength)]).toBytes(), base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), base.itemDelimitation(), base.sequenceDelimitation()));
        assert.deepEqual(new Fragments(Tag.PixelData, VR.OW, [], [new Fragment(4, Value.fromBytes(VR.OW,[1, 2, 3, 4]))]).toBytes(), base.concatv(data.pixeDataFragments(), base.item(0), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation()));
    });

    it("should have expected string representations in terms of number of lines", function () {
        let checkString = function(string, nLines) { return assert.equal(string.split(/\n/).length, nLines) };

        checkString(preambleElement.toString(), 1);
        checkString(new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, "20010101")).toString(), 1);
        checkString(new SequenceElement(Tag.DerivationCodeSequence, 10).toString(), 1);
        checkString(new FragmentsElement(Tag.PixelData, VR.OW).toString(), 1);
        checkString(new FragmentElement(1, 4, Value.fromBytes(VR.OW,[1, 2, 3, 4])).toString(), 1);
        checkString(new ItemElement(1, 10).toString(), 1);
        checkString(new ItemDelimitationElement(1).toString(), 1);
        checkString(new SequenceDelimitationElement().toString(), 1);
        checkString(new Sequence(Tag.DerivationCodeSequence, base.indeterminateLength, [new Item(create(), base.indeterminateLength)]).toString(), 1);
        checkString(new Fragments(Tag.PixelData, VR.OW, [], [new Fragment(4, Value.fromBytes(VR.OW,[1, 2, 3, 4]))]).toString(), 1);
    });

});
