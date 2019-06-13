const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const VR = require("../src/vr");
const UID = require("../src/uid");
const {parseFlow} = require("../src/dicom-parser");
const data = require("./test-data");
const util = require("./test-util");
const {Chunker} = require("./chunker");

describe("DICOM parse flow", function () {

    it("should produce a preamble, FMI tags and dataset tags for a complete DICOM file", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should read files without preamble but with FMI", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should read a file with only FMI", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should read a file with neither FMI nor preamble", function () {
        let bytes = data.patientNameJohnDoe();

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should not output value chunks when value length is zero", function () {
        let bytes = Buffer.from([8, 0, 32, 0, 68, 65, 0, 0, 16, 0, 16, 0, 80, 78, 0, 0]);

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectHeader(Tag.PatientName)
                .expectDicomComplete();
        });
    });

    it("should output a warning id when non-meta information is included in the header", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID(), data.studyDate()), data.transferSyntaxUID(), data.studyDate());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should treat a preamble alone as a valid DICOM file", function () {
        let bytes = data.preamble;

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectDicomComplete();
        });
    });

    it("should skip very long (and obviously erroneous) transfer syntaxes (see warning log id)", function () {
        let tsuid = data.transferSyntaxUID();
        let malformedTsuid = base.concatv(
            tsuid.slice(0, 6),
            Buffer.from([20, 8]),
            tsuid.slice(tsuid.length - 20, tsuid.length),
            Buffer.from(new Array(2048).fill(0))
        );
        let bytes = base.concatv(data.fmiGroupLength(malformedTsuid), malformedTsuid, data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should fail reading a truncated DICOM file", function () {
        let bytes = data.patientNameJohnDoe().slice(0, 14);
        return util.expectDicomError(() => util.testParts(bytes, parseFlow(), parts => {}));
    });

    it("should inflate deflated datasets", function () {
        let bytes = base.concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(base.concatv(data.patientNameJohnDoe(), data.studyDate())));

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
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
    });

    it("should inflate gzip deflated datasets (with warning id)", function () {
        let bytes = base.concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(base.concatv(data.patientNameJohnDoe(), data.studyDate()), true));

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
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
    });

    it("should pass through deflated data when asked not to inflate", function () {
        let bytes = base.concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(base.concatv(data.patientNameJohnDoe(), data.studyDate())));

        return util.testParts(bytes, parseFlow(8192, false), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDeflatedChunk()
                .expectDicomComplete();
        });
    });

    it("should read DICOM data with fragments", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectFragments()
                .expectFragment(1, 4)
                .expectValueChunk()
                .expectFragment(2, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectDicomComplete();
        });
    });

    it("should issue a warning when a fragments delimitation tag has nonzero length", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitationNonZeroLength());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectFragments()
                .expectFragment(1, 4)
                .expectValueChunk()
                .expectFragment(2, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectDicomComplete();
        });
    });

    it("should parse a tag which is not an item, item data nor fragments delimitation inside fragments as unknown", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), data.studyDate(), base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectFragments()
                .expectFragment(1, 4)
                .expectValueChunk()
                .expectUnknownPart()
                .expectFragment(2, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectDicomComplete();
        });
    });

    it("should read DICOM data containing a sequence", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
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
    });

    it("should read DICOM data containing a sequence in a sequence", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
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
    });

    it("should read a valid DICOM file correctly when data chunks are very small", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        let chunker = new Chunker(1);
        let flow = pipe(chunker, parseFlow());

        return util.testParts(bytes, flow, parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should not accept a non-DICOM file", function () {
        let bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        return util.expectDicomError(() => util.testParts(bytes, parseFlow(), parts => {}));
    });

    it("should read DICOM files with explicit VR big-endian transfer syntax", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired)), data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired), data.patientNameJohnDoe(true));

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should read DICOM files with implicit VR little endian transfer syntax", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID(UID.ImplicitVRLittleEndian)), data.transferSyntaxUID(UID.ImplicitVRLittleEndian), data.patientNameJohnDoe(false, false));

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should chunk value data according to max chunk size", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(5), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectValueChunk()
                .expectValueChunk()
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should chunk deflated data according to max chunk size", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)), data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian), util.deflate(data.patientNameJohnDoe(), data.studyDate()));

        return util.testParts(bytes, parseFlow(22, false), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDeflatedChunk()
                .expectDeflatedChunk()
                .expectDicomComplete();
        });
    });

    it("should accept meta information encoded with implicit VR", function () {
        let bytes = base.concatv(data.preamble, data.transferSyntaxUID(UID.ExplicitVRLittleEndian, false, false), data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should handle values with length larger than the signed int range", function () {
        let length = 0x80000000;
        let bytes = base.concat(Buffer.from([0xe0, 0x7f, 0x10, 0x00, 0x4f, 0x57, 0, 0]), base.intToBytes(length, false));

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PixelData, VR.OW, length)
                .expectDicomComplete();
        });
    });

    it("should handle sequences and items of determinate length", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 8 + 18 + 16), base.item(18 + 16), data.studyDate(), data.patientNameJohnDoe(), data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
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
    });

    it("should handle fragments with empty basic offset table (first item)", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(0), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectFragments()
                .expectFragment(1, 0)
                .expectFragment(2, 4)
                .expectValueChunk(4)
                .expectFragmentsDelimitation()
                .expectDicomComplete();
        });
    });

    it("should parse sequences with VR UN as a block of bytes", function () {
        let unSequence = base.concatv(base.tagToBytes(Tag.CTExposureSequence), Buffer.from("UN"), Buffer.from([0, 0]), base.intToBytes(24));
        let bytes = base.concatv(data.patientNameJohnDoe(), unSequence, base.item(16), data.studyDate());

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should parse sequences with VR UN, and where the nested data set(s) have implicit VR, as a block of bytes", function () {
        let unSequence = base.concatv(base.tagToBytes(Tag.CTExposureSequence), Buffer.from("UN"), Buffer.from([0, 0]), base.intToBytes(24));
        let bytes = base.concatv(data.patientNameJohnDoe(), unSequence, base.item(16), data.studyDate(false, false));

        return util.testParts(bytes, parseFlow(), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

});
