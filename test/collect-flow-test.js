const pipe = require("multipipe");
const assert = require("assert");
const base = require("../src/base");
const Tag = require("../src/tag");
const {TagPath} = require("../src/tag-path");
const {parseFlow} = require("../src/dicom-parser");
const {collectFlow, collectFromTagPathsFlow} = require("../src/collect-flow");
const data = require("./test-data");
const util = require("./util");

describe("A collect elements flow", function () {
    it("should first produce an elements part followed by the input dicom parts", function () {
        let bytes = base.concat(data.studyDate(), data.patientNameJohnDoe());
        let tags = [Tag.StudyDate, Tag.PatientName].map(TagPath.fromTag);
        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow(tags, "tag")), parts => {
            let e = parts.shift();
            assert.equal(e.label, "tag");
            assert.equal(e.elements.size, 2);
            assert(e.elements.elementByTag(Tag.StudyDate) !== undefined);
            assert(e.elements.elementByTag(Tag.PatientName) !== undefined);

            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should produce an empty elements part when stream is empty", function () {
        let bytes = base.emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow([], "tag")), parts => {
            let e = parts.shift();
            assert(e.elements.isEmpty());

            util.partProbe(parts)
                .expectDicomComplete()
        });
    });

    it("should produce an empty elements part when no relevant data elements are present", function () {
        let bytes = base.concat(data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow([Tag.Modality, Tag.SeriesInstanceUID].map(TagPath.fromTag), "tag")), parts => {
            let e = parts.shift();
            assert(e.elements.isEmpty());

            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should apply the stop tag appropriately", function () {
        let bytes = base.concatv(data.studyDate(), data.patientNameJohnDoe(), data.pixelData(2000));

        return util.testParts(bytes, pipe(parseFlow(500), collectFromTagPathsFlow([Tag.StudyDate, Tag.PatientName].map(TagPath.fromTag), "tag")), parts => {
            let e = parts.shift();
            assert.equal(e.label, "tag");
            assert.equal(e.elements.size, 2);
            assert(e.elements.elementByTag(Tag.StudyDate) !== undefined);
            assert(e.elements.elementByTag(Tag.PatientName) !== undefined);

            util.partProbe(parts)
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
        });
    });

    it("should fail if max buffer size is exceeded", function () {
        let bytes = base.concatv(data.studyDate(), data.patientNameJohnDoe(), data.pixelData(2000));

        return util.expectDicomError(() => util.testParts(bytes, pipe(
            parseFlow(500),
            collectFlow(
            tagPath => tagPath.tag() === Tag.PatientName,
            tagPath => tagPath.tag() > Tag.PixelData,
            "tag",
            1000)
        ), () => {}));
    });

});
