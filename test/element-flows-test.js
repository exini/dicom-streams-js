const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const {parseFlow} = require("../src/parse-flow");
const data = require("./test-data");
const util = require("./test-util");
const {elementFlow} = require("../src/element-flows");
const {printFlow} = require("../src/flows");

describe("A DICOM elements flow", function () {
    it("should combine headers and value chunks into elements", function () {
        let bytes = base.concat(data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), elements => {
            util.elementProbe(elements)
                .expectElement(Tag.PatientName)
                .expectElement(Tag.StudyDate)
                .expectDicomComplete();
        });
    });
    
    it("should combine items in fragments into fragment elements", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), elements => {
            util.elementProbe(elements)
                .expectFragments(Tag.PixelData)
                .expectFragment(4)
                .expectFragment(4)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should handle elements and fragments of zero length", function () {
        let bytes = base.concatv(Buffer.from([8, 0, 32, 0, 68, 65, 0, 0]), data.patientNameJohnDoe(),
            data.pixeDataFragments(), base.item(0), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), elements => {
            util.elementProbe(elements)
                .expectElement(Tag.StudyDate, base.emptyBuffer)
                .expectElement(Tag.PatientName, Buffer.from("John^Doe"))
                .expectFragments(Tag.PixelData)
                .expectFragment(0)
                .expectFragment(4)
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should handle determinate length sequences and items", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), elements => {
            util.elementProbe(elements)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectElement(Tag.PatientName)
                .expectDicomComplete();
        });
    });

});


