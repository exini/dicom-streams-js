const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const parser = require("../src/dicom-parser");
const {toFlow} = require("../src/dicom-flow");
const {toIndeterminateLengthSequences} = require("../src/dicom-flows");
const data = require("./test-data");
const util = require("./util");

describe("The sequence length filter", function () {
    it("should replace determinate length sequences and items with indeterminate, and insert delimitations", function () {
        let bytes =
            base.concatv(data.sequence(Tag.DerivationCodeSequence, 56), base.item(16), data.studyDate(), base.item(), data.studyDate(), base.itemDelimitation(),
                data.sequence(Tag.AbstractPriorCodeSequence), base.item(), data.studyDate(), base.itemDelimitation(), base.item(16), data.studyDate(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(new parser.ParseFlow(), toFlow(toIndeterminateLengthSequences)), parts => {
            util.probe(parts)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation() // inserted
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation() // inserted
                .expectSequence(Tag.AbstractPriorCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation() // inserted
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should handle sequences that end with an item delimitation", function () {
        let bytes = base.concatv(
            data.sequence(Tag.DerivationCodeSequence, 32), base.item(), data.studyDate(), base.itemDelimitation());

        return util.testParts(bytes, pipe(new parser.ParseFlow(), toFlow(toIndeterminateLengthSequences)), parts => {
            util.probe(parts)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should not remove length from items in fragments", function () {
        let bytes = base.concatv(
            data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation(),
            data.sequence(Tag.DerivationCodeSequence, 40), base.item(32),
            data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(new parser.ParseFlow(), toFlow(toIndeterminateLengthSequences)), parts => {
            util.probe(parts)
                .expectFragments()
                .expectItem(1, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectFragments()
                .expectItem(1, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should work in datasets with nested sequences", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 60), base.item(52), data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(new parser.ParseFlow(), toFlow(toIndeterminateLengthSequences)), parts => {
            util.probe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should handle empty sequences and items", function () {
        let bytes = base.concatv(
            data.sequence(Tag.DerivationCodeSequence, 52), base.item(16), data.studyDate(),
            base.item(0), base.item(12), data.sequence(Tag.DerivationCodeSequence, 0));

        return util.testParts(bytes, pipe(new parser.ParseFlow(), toFlow(toIndeterminateLengthSequences)), parts => {
            util.probe(parts)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2, -1)
                .expectItemDelimitation()
                .expectItem(3, -1)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });
});
