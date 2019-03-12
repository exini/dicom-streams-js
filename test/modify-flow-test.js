const pipe = require("multipipe");
const assert = require("assert");
const base = require("../src/base");
const Tag = require("../src/tag");
const VR = require("../src/vr");
const {TagPath} = require("../src/tag-path");
const {parseFlow} = require("../src/dicom-parser");
const {modifyFlow, TagInsertion, TagModification} = require("../src/modify-flow");
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
                .expectDicomComplete()
        });
    });
});

/*

it should "not modify elements in datasets other than the dataset the tag path points to" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ item() ++ patientNameJohnDoe() ++ studyDate() ++ itemDelimitation() ++ sequenceDelimitation()

val mikeBytes = ByteString('M', 'i', 'k', 'e')

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(modifications = Seq(TagModification.equals(TagPath.fromTag(Tag.PatientName), _ => mikeBytes))))

source.runWith(TestSink.probe[DicomPart])
    .expectSequence(Tag.DerivationCodeSequence)
    .expectItem(1)
    .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
    .expectValueChunk(patientNameJohnDoe().drop(8))
    .expectHeader(Tag.StudyDate)
    .expectValueChunk()
    .expectItemDelimitation()
    .expectSequenceDelimitation()
    .expectDicomComplete()
}

it should "insert elements if not present" in {
    val bytes = patientNameJohnDoe()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.StudyDate), _ => studyDate().drop(8)))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.StudyDate, VR.DA, studyDate().length - 8)
        .expectValueChunk(studyDate().drop(8))
        .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
        .expectValueChunk(patientNameJohnDoe().drop(8))
        .expectDicomComplete()
}

it should "insert elements if not present also at end of dataset" in {
    val bytes = studyDate()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.PatientName), _ => patientNameJohnDoe().drop(8)))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.StudyDate, VR.DA, studyDate().length - 8)
        .expectValueChunk(studyDate().drop(8))
        .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
        .expectValueChunk(patientNameJohnDoe().drop(8))
        .expectDicomComplete()
}

it should "insert elements if not present also at end of dataset when last element is empty" in {
    val bytes = tagToBytesLE(0x00080050) ++ ByteString("SH") ++ shortToBytesLE(0x0000)

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.SOPInstanceUID), _ => ByteString("1.2.3.4 ")))))

source.runWith(TestSink.probe[DicomPart])
    .expectHeader(Tag.SOPInstanceUID, VR.UI, 8)
    .expectValueChunk(8)
    .expectHeader(Tag.AccessionNumber, VR.SH, 0)
    .expectDicomComplete()
}

it should "insert elements between a normal attribute and a sequence" in {
    val bytes = studyDate() ++ sequence(Tag.AbstractPriorCodeSequence) ++ sequenceDelimitation()

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.PatientName), _ => patientNameJohnDoe().drop(8)))))

source.runWith(TestSink.probe[DicomPart])
    .expectHeader(Tag.StudyDate, VR.DA, studyDate().length - 8)
    .expectValueChunk(studyDate().drop(8))
    .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
    .expectValueChunk(patientNameJohnDoe().drop(8))
    .expectSequence(Tag.AbstractPriorCodeSequence)
    .expectSequenceDelimitation()
    .expectDicomComplete()
}

it should "insert elements between a sequence and a normal attribute" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ sequenceDelimitation() ++ patientID()

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.PatientName), _ => patientNameJohnDoe().drop(8)))))

source.runWith(TestSink.probe[DicomPart])
    .expectSequence(Tag.DerivationCodeSequence)
    .expectSequenceDelimitation()
    .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
    .expectValueChunk(patientNameJohnDoe().drop(8))
    .expectHeader(Tag.PatientID, VR.LO, patientID().length - 8)
    .expectValueChunk(patientID().drop(8))
    .expectDicomComplete()
}

it should "insert elements between two sequences" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ sequenceDelimitation() ++ sequence(Tag.AbstractPriorCodeSequence) ++ sequenceDelimitation()

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.PatientName), _ => patientNameJohnDoe().drop(8)))))

source.runWith(TestSink.probe[DicomPart])
    .expectSequence(Tag.DerivationCodeSequence)
    .expectSequenceDelimitation()
    .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
    .expectValueChunk(patientNameJohnDoe().drop(8))
    .expectSequence(Tag.AbstractPriorCodeSequence)
    .expectSequenceDelimitation()
    .expectDicomComplete()
}

it should "modify, not insert, when 'insert' elements are already present" in {
    val bytes = studyDate() ++ patientNameJohnDoe()

    val mikeBytes = ByteString('M', 'i', 'k', 'e')

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(
            TagInsertion(TagPath.fromTag(Tag.StudyDate), _ => ByteString.empty),
            TagInsertion(TagPath.fromTag(Tag.PatientName), _ => mikeBytes))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.StudyDate, VR.DA, 0)
        .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
        .expectValueChunk(mikeBytes)
        .expectDicomComplete()
}

it should "modify based on current value, when 'insert' elements are already present" in {
    val bytes = patientNameJohnDoe()

    val mikeBytes = ByteString('M', 'i', 'k', 'e')

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(
            TagInsertion(TagPath.fromTag(Tag.PatientName), _.map(_ ++ ByteString(" Senior ")).getOrElse(mikeBytes)))))

source.runWith(TestSink.probe[DicomPart])
    .expectHeader(Tag.PatientName, VR.PN, 16)
    .expectValueChunk(ByteString("John^Doe Senior "))
    .expectDicomComplete()
}

it should "insert all relevant elements below the current tag number" in {
    val bytes = patientNameJohnDoe()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(
            TagInsertion(TagPath.fromTag(Tag.SeriesDate), _ => studyDate().drop(8)),
            TagInsertion(TagPath.fromTag(Tag.StudyDate), _ => studyDate().drop(8)))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.StudyDate, VR.DA, studyDate().length - 8)
        .expectValueChunk(studyDate().drop(8))
        .expectHeader(Tag.SeriesDate, VR.DA, studyDate().length - 8)
        .expectValueChunk(studyDate().drop(8))
        .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().length - 8)
        .expectValueChunk(patientNameJohnDoe().drop(8))
        .expectDicomComplete()
}

it should "not insert elements if dataset contains no elements" in {
    val source = Source.empty
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.SeriesDate), _ => studyDate().drop(8)))))

    source.runWith(TestSink.probe[DicomPart])
        .expectDicomComplete()
}

it should "insert elements in sequences if sequence is present but element is not present" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ sequenceDelimitation()

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate), _ => studyDate().drop(8)))))

source.runWith(TestSink.probe[DicomPart])
    .expectSequence(Tag.DerivationCodeSequence)
    .expectItem(1)
    .expectHeader(Tag.StudyDate)
    .expectValueChunk()
    .expectHeader(Tag.PatientName)
    .expectValueChunk()
    .expectItemDelimitation()
    .expectSequenceDelimitation()
    .expectDicomComplete()
}

it should "skip inserting elements in missing sequences" in {
    val bytes = patientNameJohnDoe()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(
            TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate), _ => studyDate().drop(8)),
            TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName), _ => ByteString.empty))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.PatientName)
        .expectValueChunk()
        .expectDicomComplete()
}

it should "not insert unknown elements" in {
    val bytes = patientNameJohnDoe()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(0x00200021), _ => ByteString(1, 2, 3, 4)))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.PatientName)
        .expectValueChunk()
        .expectDicomError()
}

it should "not insert sequences" in {
    val bytes = patientNameJohnDoe()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.DerivationCodeSequence), _ => ByteString.empty))))

    source.runWith(TestSink.probe[DicomPart])
        .expectDicomError()
}

it should "insert into the correct sequence item" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ sequenceDelimitation()

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.StudyDate), _ => studyDate().drop(8)))))

source.runWith(TestSink.probe[DicomPart])
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
    .expectDicomComplete()
}

it should "modify the correct sequence item" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ sequenceDelimitation()

val mikeBytes = ByteString('M', 'i', 'k', 'e')

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(modifications = Seq(
        TagModification.equals(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientName), _ => mikeBytes))))

source.runWith(TestSink.probe[DicomPart])
    .expectSequence(Tag.DerivationCodeSequence)
    .expectItem(1)
    .expectHeader(Tag.PatientName, VR.PN, patientNameJohnDoe().drop(8).length)
    .expectValueChunk()
    .expectItemDelimitation()
    .expectItem(2)
    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
    .expectValueChunk()
    .expectItemDelimitation()
    .expectSequenceDelimitation()
    .expectDicomComplete()
}

it should "modify all sequence items" in {
    val bytes = sequence(Tag.DerivationCodeSequence) ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ item() ++ patientNameJohnDoe() ++ itemDelimitation() ++ sequenceDelimitation()

val mikeBytes = ByteString('M', 'i', 'k', 'e')
val tagTree = TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.PatientName)

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(modifications = Seq(TagModification(tagTree.hasPath, _ => mikeBytes))))

source.runWith(TestSink.probe[DicomPart])
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
    .expectDicomComplete()
}

it should "correctly sort elements with tag numbers exceeding the positive range of its signed integer representation" in {
    val bytes = preamble ++ fmiGroupLength(transferSyntaxUID()) ++ transferSyntaxUID() ++ ByteString(0xFF, 0xFF, 0xFF, 0xFF, 68, 65, 10, 0, 49, 56, 51, 49, 51, 56, 46, 55, 54, 53)

val mikeBytes = ByteString('M', 'i', 'k', 'e')

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(insertions = Seq(TagInsertion(TagPath.fromTag(Tag.PatientName), _ => mikeBytes))))

source.runWith(TestSink.probe[DicomPart])
    .expectPreamble()
    .expectHeader(Tag.FileMetaInformationGroupLength)
    .expectValueChunk()
    .expectHeader(Tag.TransferSyntaxUID)
    .expectValueChunk()
    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
    .expectValueChunk()
    .expectHeader(-1, VR.DA, 10)
    .expectValueChunk()
    .expectDicomComplete()
}

it should "work also with the endsWith modification matcher" in {
    val bytes = studyDate() ++ sequence(Tag.DerivationCodeSequence) ++ item() ++ studyDate() ++ patientNameJohnDoe() ++ itemDelimitation() ++ sequenceDelimitation()

val studyBytes = ByteString("2012-01-01")

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(modifications = Seq(TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), _ => studyBytes))))

source.runWith(TestSink.probe[DicomPart])
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
    .expectDicomComplete()
}

it should "pick up tag modifications from the stream" in {
    val bytes = studyDate() ++ patientNameJohnDoe()

    val mikeBytes = ByteString('M', 'i', 'k', 'e')

    val source = Source.single(bytes)
        .via(parseFlow)
        .prepend(Source.single(TagModificationsPart(Seq(TagModification.equals(
            TagPath.fromTag(Tag.PatientName), _ => mikeBytes)), Seq.empty)))
        .via(modifyFlow(modifications = Seq(TagModification.equals(TagPath.fromTag(Tag.StudyDate), _ => ByteString.empty))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.StudyDate, VR.DA, 0)
        .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
        .expectValueChunk(mikeBytes)
        .expectDicomComplete()
}

it should "pick up tag modifications and replace old modifications" in {
    val bytes = studyDate() ++ patientNameJohnDoe()

    val mikeBytes = ByteString('M', 'i', 'k', 'e')

    val source = Source.single(bytes)
        .via(parseFlow)
        .prepend(Source.single(TagModificationsPart(Seq(TagModification.equals(
            TagPath.fromTag(Tag.PatientName), _ => mikeBytes)), Seq.empty, replace = true)))
        .via(modifyFlow(modifications = Seq(TagModification.equals(TagPath.fromTag(Tag.StudyDate), _ => ByteString.empty))))

    source.runWith(TestSink.probe[DicomPart])
        .expectHeader(Tag.StudyDate)
        .expectValueChunk()
        .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
        .expectValueChunk(mikeBytes)
        .expectDicomComplete()
}

it should "not emit sequence and item delimiters for data with explicit length sequences and items" in {
    val bytes = patientNameJohnDoe() ++
    sequence(Tag.DerivationCodeSequence, 24) ++
    item(16) ++ studyDate()

val source = Source.single(bytes)
    .via(parseFlow)
    .via(modifyFlow(logGroupLengthWarnings = false))

source.runWith(TestSink.probe[DicomPart])
    .expectHeader(Tag.PatientName)
    .expectValueChunk()
    .expectSequence(Tag.DerivationCodeSequence, 24)
    .expectItem(1, 16)
    .expectHeader(Tag.StudyDate)
    .expectValueChunk()
    .expectDicomComplete()
}

*/