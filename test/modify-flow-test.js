const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const VR = require("../src/vr");
const {TagPath} = require("../src/tag-path");
const {TagTree} = require("../src/tag-tree");
const {parseFlow} = require("../src/dicom-parser");
const {modifyFlow, TagInsertion, TagModification, TagModificationsPart} = require("../src/modify-flow");
const {prependFlow} = require("../src/flows");
const data = require("./test-data");
const util = require("./util");

describe("The modify flow", function () {
    it("should modify the value of the specified elements", function () {
        let bytes = base.concat(data.studyDate(), data.patientNameJohnDoe());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromTag(Tag.StudyDate), () => base.emptyBuffer),
            TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, 0)
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk(4)
                .expectDicomComplete();
        });
    });

    it("should not modify elements in datasets other than the dataset the tag path points to", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should insert elements if not present", function () {
        let bytes = base.concatv(data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.StudyDate), () => data.studyDate().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                .expectValueChunk(data.studyDate().slice(8))
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectDicomComplete();
        });
    });

    it("should insert elements if not present also at end of dataset", function () {
        let bytes = base.concatv(data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                .expectValueChunk(data.studyDate().slice(8))
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectDicomComplete();
        });
    });

    it("should insert elements if not present also at end of dataset when last element is empty", function () {
        let bytes = base.concatv(base.tagToBytesLE(0x00080050), Buffer.from("SH"), base.shortToBytesLE(0x0000));

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.SOPInstanceUID), () => Buffer.from("1.2.3.4 "))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SOPInstanceUID, VR.UI, 8)
                .expectValueChunk(8)
                .expectHeader(Tag.AccessionNumber, VR.SH, 0)
                .expectDicomComplete();
        });
    });

    it("should insert elements between a normal attribute and a sequence", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.AbstractPriorCodeSequence), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                .expectValueChunk(data.studyDate().slice(8))
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectSequence(Tag.AbstractPriorCodeSequence)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should insert elements between a sequence and a normal attribute", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.sequenceDelimitation(), data.patientID());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectSequenceDelimitation()
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectHeader(Tag.PatientID, VR.LO, data.patientID().length - 8)
                .expectValueChunk(data.patientID().slice(8))
                .expectDicomComplete();
        });
    });

    it("should insert elements between two sequences", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.sequenceDelimitation(), data.sequence(Tag.AbstractPriorCodeSequence), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectSequenceDelimitation()
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectSequence(Tag.AbstractPriorCodeSequence)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should modify, not insert, when 'insert' elements are already present", function () {
        let bytes = base.concatv(data.studyDate(), data.patientNameJohnDoe());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.StudyDate), () => base.emptyBuffer),
            new TagInsertion(TagPath.fromTag(Tag.PatientName), () => mikeBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, 0)
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk(mikeBytes)
                .expectDicomComplete();
        });
    });

    it("should modify based on current value, when 'insert' elements are already present", function () {
        let bytes = data.patientNameJohnDoe();

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.PatientName), b => base.concat(b, Buffer.from(" Senior ")))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName, VR.PN, 16)
                .expectValueChunk(Buffer.from("John^Doe Senior "))
                .expectDicomComplete();
        });
    });

    it("should insert all relevant elements below the current tag number", function () {
        let bytes = data.patientNameJohnDoe();

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.SeriesDate), () => data.studyDate().slice(8)),
            new TagInsertion(TagPath.fromTag(Tag.StudyDate), () => data.studyDate().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                .expectValueChunk(data.studyDate().slice(8))
                .expectHeader(Tag.SeriesDate, VR.DA, data.studyDate().length - 8)
                .expectValueChunk(data.studyDate().slice(8))
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectDicomComplete();
        });
    });

    it("should not insert elements if dataset contains no elements", function () {
        return util.testParts(base.emptyBuffer, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.SeriesDate), () => data.studyDate().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should insert elements in sequences if sequence is present but element is not present", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate), () => data.studyDate().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should skip inserting elements in missing sequences", function () {
        let bytes = base.concatv(data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate), () => data.studyDate().slice(8)),
            new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName), () => base.emptyBuffer)
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should not insert unknown elements", function () {
        let bytes = base.concatv(data.patientNameJohnDoe());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(0x00200021), () => Buffer.from([1, 2, 3, 4]))
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk();
        }));
    });

    it("should not insert sequences", function () {
        let bytes = base.concatv(data.patientNameJohnDoe());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.DerivationCodeSequence), () => base.emptyBuffer)
        ])), parts => {
        }))
    });

    it("should insert into the correct sequence item", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.StudyDate), () => data.studyDate().slice(8))
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should modify the correct sequence item", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientName), () => mikeBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().slice(8).length)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should modify all sequence items", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);
        let tagTree = TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.PatientName);

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            new TagModification(tagTree.hasPath.bind(tagTree), () => mikeBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should correctly sort elements with high tag numbers", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 68, 65, 10, 0, 49, 56, 51, 49, 51, 56, 46, 55, 54, 53]));

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [
            new TagInsertion(TagPath.fromTag(Tag.PatientName), () => mikeBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk()
                .expectHeader(0xFFFFFFFF, VR.DA, 10)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should work also with the endsWith modification matcher", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence), base.item(), data.studyDate(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation());

        let studyBytes = Buffer.from("2012-01-01");

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), () => studyBytes)
        ])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk(studyBytes)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk(studyBytes)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should pick up tag modifications from the stream", function () {
        let bytes = base.concatv(data.studyDate(), data.patientNameJohnDoe());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(
            parseFlow(),
            prependFlow(new TagModificationsPart([TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes)]), true),
            modifyFlow([
                TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), () => base.emptyBuffer)
            ])
        ), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate, VR.DA, 0)
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk(mikeBytes)
                .expectDicomComplete();
        });
    });

    it("should pick up tag modifications and replace old modifications", function () {
        let bytes = base.concatv(data.studyDate(), data.patientNameJohnDoe());

        let mikeBytes = Buffer.from(['M', 'i', 'k', 'e']);

        return util.testParts(bytes, pipe(
            parseFlow(),
            prependFlow(new TagModificationsPart([TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes)], [], true), true),
            modifyFlow([
                TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), () => base.emptyBuffer)
            ])
        ), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                .expectValueChunk(mikeBytes)
                .expectDicomComplete();
        });
    });

    it("should not emit sequence and item delimiters for data with explicit length sequences and items", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [], false)), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

});
