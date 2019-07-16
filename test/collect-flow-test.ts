import assert from "assert";
import { ElementsPart } from "../src";
import { concat, concatv, emptyBuffer, pipe } from "../src/base";
import {collectFlow, collectFromTagPathsFlow} from "../src/collect-flow";
import {parseFlow} from "../src/parse-flow";
import {Tag} from "../src/tag";
import {TagPath} from "../src/tag-path";
import * as data from "./test-data";
import * as util from "./test-util";

describe("A collect elements flow", () => {
    it("should first produce an elements part followed by the input dicom parts", () => {
        const bytes = concat(data.studyDate(), data.patientNameJohnDoe());
        const tags = [Tag.StudyDate, Tag.PatientName].map(TagPath.fromTag);
        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow(tags, "tag")), (parts) => {
            const e = parts.shift() as ElementsPart;
            assert.strictEqual(e.label, "tag");
            assert.strictEqual(e.elements.size, 2);
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

    it("should produce an empty elements part when stream is empty", () => {
        const bytes = emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow([], "tag")), (parts) => {
            const e = parts.shift() as ElementsPart;
            assert(e.elements.isEmpty());

            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should produce an empty elements part when no relevant data elements are present", () => {
        const bytes = concat(data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(),
            collectFromTagPathsFlow([Tag.Modality, Tag.SeriesInstanceUID].map(TagPath.fromTag), "tag")), (parts) => {
            const e = parts.shift() as ElementsPart;
            assert(e.elements.isEmpty());

            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should apply the stop tag appropriately", () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe(), data.pixelData(2000));

        return util.testParts(bytes, pipe(parseFlow(500),
            collectFromTagPathsFlow([Tag.StudyDate, Tag.PatientName].map(TagPath.fromTag), "tag")), (parts) => {
            const e = parts.shift() as ElementsPart;
            assert.strictEqual(e.label, "tag");
            assert.strictEqual(e.elements.size, 2);
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
                .expectDicomComplete();
        });
    });

    it("should fail if max buffer size is exceeded", () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe(), data.pixelData(2000));

        return util.expectDicomError(() => util.testParts(bytes, pipe(
            parseFlow(500),
            collectFlow(
            (tagPath) => tagPath.tag() === Tag.PatientName,
            (tagPath) => tagPath.tag() > Tag.PixelData,
            "tag",
            1000),
        ), () => {
            // do nothing
        }));
    });

});
