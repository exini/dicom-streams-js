const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const {TagPath} = require("../src/tag-path");
const {parseFlow} = require("../src/dicom-parser");
const data = require("./test-data");
const util = require("./util");
const {elementFlow} = require("../src/element-flows");
const {printFlow} = require("../src/flows");

/*
describe("A collect elements flow", function () {
    it("should first produce an elements part followed by the input dicom parts", function () {
        let bytes = base.concat(data.studyDate(), data.patientNameJohnDoe());
        let tags = [Tag.StudyDate, Tag.PatientName].map(TagPath.fromTag);
        let source = Source.single(bytes)
        .via(parseFlow)
        .via(collectFlow(tags, "tag"))

    source.runWith(TestSink.probe[DicomPart])
        .request(1)
        .expectNextChainingPF {
case e: ElementsPart =>
        e.label shouldBe "tag"
    e.elements should have size 2
    e.elements(Tag.StudyDate) should not be empty
    e.elements(Tag.PatientName) should not be empty
}
.expectHeader(Tag.StudyDate)
    .expectValueChunk()
    .expectHeader(Tag.PatientName)
    .expectValueChunk()
    .expectDicomComplete()
}

it should "produce an empty elements part when stream is empty" in {
    val bytes = ByteString.empty

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(collectFlow(Set.empty, "tag"))

    source.runWith(TestSink.probe[DicomPart])
        .request(1)
        .expectNextChainingPF {
case e: ElementsPart => e.elements.isEmpty shouldBe true
}
.expectDicomComplete()
}

it should "produce an empty elements part when no relevant data elements are present" in {
    val bytes = patientNameJohnDoe() ++ studyDate()

    val source = Source.single(bytes)
        .via(parseFlow)
        .via(collectFlow(Set(Tag.Modality, Tag.SeriesInstanceUID).map(TagPath.fromTag), "tag"))

    source.runWith(TestSink.probe[DicomPart])
        .request(1)
        .expectNextChainingPF {
case e: ElementsPart => e.elements.isEmpty shouldBe true
}
.expectHeader(Tag.PatientName)
    .expectValueChunk()
    .expectHeader(Tag.StudyDate)
    .expectValueChunk()
    .expectDicomComplete()
}

it should "apply the stop tag appropriately" in {
    val bytes = studyDate() ++ patientNameJohnDoe() ++ pixelData(2000)

val source = Source.single(bytes)
    .via(ParseFlow(chunkSize = 500))
    .via(collectFlow(Set(Tag.StudyDate, Tag.PatientName).map(TagPath.fromTag), "tag", maxBufferSize = 1000))

source.runWith(TestSink.probe[DicomPart])
    .request(1)
    .expectNextChainingPF {
case e: ElementsPart =>
        e.label shouldBe "tag"
    e.elements.size shouldBe 2
    e.elements(Tag.StudyDate) should not be empty
    e.elements(Tag.PatientName) should not be empty
}
.expectHeader(Tag.StudyDate)
    .expectValueChunk()
    .expectHeader(Tag.PatientName)
    .expectValueChunk()
    .expectHeader(Tag.PixelData)
    .expectValueChunk()
    .expectValueChunk()
    .expectValueChunk()
    .expectValueChunk()
    .expectDicomComplete()
}

it should "fail if max buffer size is exceeded" in {
    val bytes = studyDate() ++ patientNameJohnDoe() ++ pixelData(2000)

val source = Source.single(bytes)
    .via(ParseFlow(chunkSize = 500))
    .via(collectFlow(_.tag == Tag.PatientName, _.tag > Tag.PixelData, "tag", maxBufferSize = 1000))

source.runWith(TestSink.probe[DicomPart])
    .expectDicomError()
}
*/
