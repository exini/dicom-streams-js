import pipe from "multipipe";
import * as base from "../src/base";
import {elementFlow} from "../src/element-flows";
import {printFlow} from "../src/flows";
import {parseFlow} from "../src/parse-flow";
import Tag from "../src/tag";
import * as data from "./test-data";
import * as util from "./test-util";

describe("A DICOM elements flow", () => {
    it("should combine headers and value chunks into elements", () => {
        const bytes = base.concat(data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectElement(Tag.PatientName)
                .expectElement(Tag.StudyDate)
                .expectDicomComplete();
        });
    });

    it("should combine items in fragments into fragment elements", () => {
        const bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]),
            base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectFragments(Tag.PixelData)
                .expectFragment(4)
                .expectFragment(4)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should handle elements and fragments of zero length", () => {
        const bytes = base.concatv(Buffer.from([8, 0, 32, 0, 68, 65, 0, 0]), data.patientNameJohnDoe(),
            data.pixeDataFragments(), base.item(0), base.item(4), Buffer.from([5, 6, 7, 8]),
                base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectElement(Tag.StudyDate, base.emptyBuffer)
                .expectElement(Tag.PatientName, Buffer.from("John^Doe"))
                .expectFragments(Tag.PixelData)
                .expectFragment(0)
                .expectFragment(4)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should handle determinate length sequences and items", () => {
        const bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 24), base.item(16),
            data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectElement(Tag.PatientName)
                .expectDicomComplete();
        });
    });

});
