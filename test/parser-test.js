const assert = require("assert");
const base = require("../src/base");
const Tag = require("../src/tag");
const VR = require("../src/vr");
const UID = require("../src/uid");
const {Parser} = require("../src/parser");
const data = require("./test-data");
const util = require("./test-util");

function parse(bytes) {
    const parser = new Parser();
    parser.parse(bytes);
    return parser.result();
}

function probe(bytes) {
    const elements = parse(bytes);
    const withPreamble = bytes.length >= 132 && bytes.slice(0, 128).every(b => b === 0);
    return util.partProbe(elements.toParts(withPreamble));
}

describe("DICOM parse flow", function () {

    it("should produce a preamble, FMI tags and dataset tags for a complete DICOM file", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should read files without preamble but with FMI", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        probe(bytes)
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should read a file with only FMI", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID());

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should read a file with neither FMI nor preamble", function () {
        let bytes = data.patientNameJohnDoe();

        probe(bytes)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should handle zero-length values", function () {
        let bytes = Buffer.from([8, 0, 32, 0, 68, 65, 0, 0, 16, 0, 16, 0, 80, 78, 0, 0]);

        probe(bytes)
            .expectHeader(Tag.StudyDate)
            .expectHeader(Tag.PatientName)
            .expectDicomComplete();
    });

    it("should output a warning id when non-meta information is included in the header", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID(), data.studyDate()), data.transferSyntaxUID(), data.studyDate());

        probe(bytes)
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should treat a preamble alone as a valid DICOM file", function () {
        let bytes = data.preamble;

        probe(bytes)
            .expectPreamble()
            .expectDicomComplete();
    });

    it("should fail reading a truncated DICOM file", function () {
        let bytes = new Buffer(256);
        assert.throws(() => {
            const parser = new Parser();
            parser.parse(bytes);
        });
    });

    it("should inflate deflated datasets", function () {
        let bytes = base.concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(base.concatv(data.patientNameJohnDoe(), data.studyDate())));

        probe(bytes)
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should inflate gzip deflated datasets (with warning id)", function () {
        let bytes = base.concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(base.concatv(data.patientNameJohnDoe(), data.studyDate()), true));

        probe(bytes)
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should read DICOM data with fragments", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 4)
            .expectValueChunk()
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it("should issue a warning when a fragments delimitation tag has nonzero length", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitationNonZeroLength());

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 4)
            .expectValueChunk()
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it("should parse a tag which is not an item, item data nor fragments delimitation inside fragments as unknown", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), data.studyDate(), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 4)
            .expectValueChunk()
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it("should read DICOM data containing a sequence", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        probe(bytes)
            .expectSequence(Tag.DerivationCodeSequence)
            .expectItem(1)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectItemDelimitation()
            .expectSequenceDelimitation()
            .expectDicomComplete();
    });

    it("should read DICOM data containing a sequence in a sequence", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        probe(bytes)
            .expectSequence(Tag.DerivationCodeSequence)
            .expectItem(1)
            .expectSequence(Tag.DerivationCodeSequence)
            .expectItem(1)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectItemDelimitation()
            .expectSequenceDelimitation()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectItemDelimitation()
            .expectSequenceDelimitation()
            .expectDicomComplete()
    });


    it("should read a valid DICOM file correctly when data chunks are very small", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        const chunkSize = 1;
        const parser = new Parser();
        for (let i = 0; i < bytes.length; i += chunkSize) {
            parser.parse(bytes.slice(i, Math.min(bytes.length, i + chunkSize)));
        }
        const elements = parser.result();
    
        util.partProbe(elements.toParts())
            .expectPreamble()
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });


    it("should not accept a non-DICOM file", function () {
        let bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.throws(() => parse(bytes));
    });

    it("should read DICOM files with explicit VR big-endian transfer syntax", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired)), data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired), data.patientNameJohnDoe(true));

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should read DICOM files with implicit VR little endian transfer syntax", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID(UID.ImplicitVRLittleEndian)), data.transferSyntaxUID(UID.ImplicitVRLittleEndian), data.patientNameJohnDoe(false, false));

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete()
    });

    it("should accept meta information encoded with implicit VR", function () {
        let bytes = base.concatv(data.preamble, data.transferSyntaxUID(UID.ExplicitVRLittleEndian, false, false), data.patientNameJohnDoe());

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should handle sequences and items of determinate length", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 8 + 16 + 16), base.item(16 + 16), data.studyDate(), data.patientNameJohnDoe(), data.patientNameJohnDoe());

        probe(bytes)
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectSequence(Tag.DerivationCodeSequence)
            .expectItem(1)
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should handle fragments with empty basic offset table (first item)", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(0), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 0)
            .expectFragment(2, 4)
            .expectValueChunk(4)
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it("should parse sequences with VR UN as a block of bytes", function () {
        let unSequence = base.concatv(base.tagToBytes(Tag.CTExposureSequence), Buffer.from("UN"), Buffer.from([0, 0]), base.intToBytes(24));
        let bytes = base.concatv(data.patientNameJohnDoe(), unSequence, base.item(16), data.studyDate());

        probe(bytes)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should parse sequences with VR UN, and where the nested data set(s) have implicit VR, as a block of bytes", function () {
        let unSequence = base.concatv(base.tagToBytes(Tag.CTExposureSequence), Buffer.from("UN"), Buffer.from([0, 0]), base.intToBytes(24));
        let bytes = base.concatv(data.patientNameJohnDoe(), unSequence, base.item(16), data.studyDate(false, false));

        probe(bytes)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it("should filter elements based on the supplied filter condition", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation(), data.patientNameJohnDoe());

        const stop = (element, depth) => false;
        const filter = (element, depth) => depth > 0 || element.tag < Tag.PatientName;
        const parser = new Parser(stop, filter);
        parser.parse(bytes);
    
        util.partProbe(parser.result().toParts(false))
            .expectSequence(Tag.DerivationCodeSequence)
            .expectItem(1)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectItemDelimitation()
            .expectSequenceDelimitation()
            .expectDicomComplete();
    });

    it("should stop parsing early based on the input stop condition", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation(), data.patientNameJohnDoe());

        const stop = (element, depth) => depth === 0 && element.tag >= Tag.PatientName;
        const parser = new Parser(stop);
        parser.parse(bytes);

        util.partProbe(parser.result().toParts(false))
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectSequence(Tag.DerivationCodeSequence)
            .expectItem(1)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectItemDelimitation()
            .expectSequenceDelimitation()
            .expectDicomComplete();
    });
});
