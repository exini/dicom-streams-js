const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const TagTree = require("../src/tag-tree");
const {parseFlow} = require("../src/dicom-parser");
const {groupLengthDiscardFilter, fmiDiscardFilter, blacklistFilter, whitelistFilter, tagFilter, toIndeterminateLengthSequences} = require("../src/dicom-flows");
const data = require("./test-data");
const util = require("./util");

describe("The DICOM group length discard filter", function () {
    it("should discard group length elements except 0002,0000", function () {
        let groupLength = base.concat(Buffer.from([8, 0, 0, 0, 85, 76, 4, 0]), base.intToBytesLE(data.studyDate().size));
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), groupLength, data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), groupLengthDiscardFilter()), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });
});

describe("The DICOM file meta information discard filter", function () {
    it("should discard file meta informaton", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), fmiDiscardFilter()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });
});

describe("The tag filter", function () {
    it("should filter elements in sequences", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.studyDate(), data.patientNameJohnDoe(),
            base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter(() => true, tagPath => tagPath.tag() !== Tag.PatientName)), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should filter elements not matching the condition", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()),
            data.fmiVersion(), data.transferSyntaxUID(), data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter(() => false, tagPath => base.groupNumber(tagPath.tag()) >= 8)), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should filter elements matching the condition", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()), data.fmiVersion(),
            data.transferSyntaxUID(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter(() => false, tagPath => !base.isFileMetaInformation(tagPath.tag()))), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });
});

describe("The whitelist filter", function () {
    it("should block all elements not on the white list", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should only apply to elements in the root dataset when filter points to root dataset", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), data.studyDate(),
            base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectDicomComplete()
        });
    });

    it("should also work on fragments", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]),
            base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([])), parts => {
            util.partProbe(parts)
                .expectDicomComplete()
        });
    });

    it("should preserve sequences and items in nested structures when using wildcards", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(),
            data.patientNameJohnDoe(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should preserve sequences and items in nested structures when using item indices", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(),
            data.patientNameJohnDoe(), base.itemDelimitation(), base.item(), data.studyDate(), base.itemDelimitation(),
            base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });
});

describe("The blacklist filter", function () {
    it("should block the entire sequence when a sequence tag is on the black list", function () {
        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(),
            data.sequence(Tag.AbstractPriorCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation(),
            base.itemDelimitation(), base.sequenceDelimitation(),
            data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromAnyItem(Tag.DerivationCodeSequence)])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should block a single item inside a sequence", function () {
        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(),
            base.item(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromTag(Tag.StudyDate), TagTree.fromItem(Tag.DerivationCodeSequence, 1)])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should block an element in an item in a sequence", function () {
        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(),
            base.item(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });
});

describe("The sequence length filter", function () {
    it("should replace determinate length sequences and items with indeterminate, and insert delimitations", function () {
        let bytes =
            base.concatv(data.sequence(Tag.DerivationCodeSequence, 56), base.item(16), data.studyDate(), base.item(), data.studyDate(), base.itemDelimitation(),
                data.sequence(Tag.AbstractPriorCodeSequence), base.item(), data.studyDate(), base.itemDelimitation(), base.item(16), data.studyDate(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
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

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
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

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
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

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
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

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
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
