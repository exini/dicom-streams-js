import assert from 'assert';
import {
    concatv,
    intToBytes,
    item,
    itemDelimitation,
    sequenceDelimitation,
    sequenceDelimitationNonZeroLength,
    tagToBytes,
} from '../src/base';
import { Elements } from '../src/elements';
import { Parser } from '../src/parser';
import { AttributeInfo } from '../src/parsing';
import { Tag } from '../src/tag';
import { UID } from '../src/uid';
import { VR } from '../src/vr';
import * as data from './test-data';
import * as util from './test-util';

function parse(bytes: Buffer): Elements {
    const parser = new Parser();
    parser.parse(bytes);
    return parser.result();
}

function probe(bytes: Buffer): util.PartProbe {
    const elements = parse(bytes);
    const withPreamble = bytes.length >= 132 && bytes.slice(0, 128).every((b) => b === 0);
    return util.partProbe(elements.toParts(withPreamble));
}

describe('DICOM parser', () => {
    it('should produce a preamble, FMI tags and dataset tags for a complete DICOM file', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

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

    it('should read files without preamble but with FMI', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

        probe(bytes)
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should read a file with only FMI', () => {
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID());

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should read a file with neither FMI nor preamble', () => {
        const bytes = data.patientNameJohnDoe();

        probe(bytes).expectHeader(Tag.PatientName).expectValueChunk().expectDicomComplete();
    });

    it('should handle zero-length values', () => {
        const bytes = Buffer.from([8, 0, 32, 0, 68, 65, 0, 0, 16, 0, 16, 0, 80, 78, 0, 0]);

        probe(bytes).expectHeader(Tag.StudyDate).expectHeader(Tag.PatientName).expectDicomComplete();
    });

    it('should output a warning id when non-meta information is included in the header', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(), data.studyDate()),
            data.transferSyntaxUID(),
            data.studyDate(),
        );

        probe(bytes)
            .expectHeader(Tag.FileMetaInformationGroupLength)
            .expectValueChunk()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should treat a preamble alone as a valid DICOM file', () => {
        const bytes = data.preamble;

        probe(bytes).expectPreamble().expectDicomComplete();
    });

    it('should fail reading a truncated DICOM file', () => {
        const bytes = Buffer.alloc(256);
        assert.throws(() => {
            const parser = new Parser();
            parser.parse(bytes);
        });
    });

    it('should inflate deflated datasets', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(concatv(data.patientNameJohnDoe(), data.studyDate())),
        );

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

    it('should inflate gzip deflated datasets (with warning id)', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(concatv(data.patientNameJohnDoe(), data.studyDate()), true),
        );

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

    it('should read DICOM data with fragments', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            item(4),
            Buffer.from([5, 6, 7, 8]),
            sequenceDelimitation(),
        );

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 4)
            .expectValueChunk()
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it('should issue a warning when a fragments delimitation tag has nonzero length', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            item(4),
            Buffer.from([5, 6, 7, 8]),
            sequenceDelimitationNonZeroLength(),
        );

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 4)
            .expectValueChunk()
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it('should parse a tag which is not an item, item data nor fragments delimitation inside fragments as unknown', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            data.studyDate(),
            item(4),
            Buffer.from([5, 6, 7, 8]),
            sequenceDelimitation(),
        );

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 4)
            .expectValueChunk()
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it('should read DICOM data containing a sequence', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

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

    it('should read DICOM data containing a sequence in a sequence', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

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
            .expectDicomComplete();
    });

    it('should read a valid DICOM file correctly when data chunks are very small', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

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

    it('should not accept a non-DICOM file', () => {
        const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.throws(() => parse(bytes));
    });

    it('should read DICOM files with explicit VR big-endian transfer syntax', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired)),
            data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired),
            data.patientNameJohnDoe(true),
        );

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

    it('should read DICOM files with implicit VR little endian transfer syntax', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID(UID.ImplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.ImplicitVRLittleEndian),
            data.patientNameJohnDoe(false, false),
        );

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

    it('should accept meta information encoded with implicit VR', () => {
        const bytes = concatv(
            data.preamble,
            data.transferSyntaxUID(UID.ExplicitVRLittleEndian, false, false),
            data.patientNameJohnDoe(),
        );

        probe(bytes)
            .expectPreamble()
            .expectHeader(Tag.TransferSyntaxUID)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should handle sequences and items of determinate length', () => {
        const bytes = concatv(
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence, 8 + 16 + 16),
            item(16 + 16),
            data.studyDate(),
            data.patientNameJohnDoe(),
            data.patientNameJohnDoe(),
        );

        probe(bytes)
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectSequence(Tag.DerivationCodeSequence, 8 + 16 + 16)
            .expectItem(1, 16 + 16)
            .expectHeader(Tag.StudyDate)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should handle fragments with empty basic offset table (first item)', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(0),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        probe(bytes)
            .expectFragments()
            .expectFragment(1, 0)
            .expectFragment(2, 4)
            .expectValueChunk()
            .expectFragmentsDelimitation()
            .expectDicomComplete();
    });

    it('should parse sequences with VR UN as a block of bytes', () => {
        const unSequence = concatv(
            tagToBytes(Tag.CTExposureSequence),
            Buffer.from('UN'),
            Buffer.from([0, 0]),
            intToBytes(24),
        );
        const bytes = concatv(data.patientNameJohnDoe(), unSequence, item(16), data.studyDate());

        probe(bytes)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should parse sequences with VR UN, and where the nested data set(s) have implicit VR, as a block of bytes', () => {
        const unSequence = concatv(
            tagToBytes(Tag.CTExposureSequence),
            Buffer.from('UN'),
            Buffer.from([0, 0]),
            intToBytes(24),
        );
        const bytes = concatv(data.patientNameJohnDoe(), unSequence, item(16), data.studyDate(false, false));

        probe(bytes)
            .expectHeader(Tag.PatientName)
            .expectValueChunk()
            .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
            .expectValueChunk()
            .expectDicomComplete();
    });

    it('should stop parsing early based on the input stop condition', () => {
        const bytes = concatv(
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
            data.patientNameJohnDoe(),
        );

        const stop = (attributeInfo: AttributeInfo, depth: number): boolean =>
            depth === 0 && 'tag' in attributeInfo && (attributeInfo as any).tag >= Tag.PatientName;
        const parser = new Parser(stop);

        assert(!parser.isComplete());
        parser.parse(bytes);
        assert(parser.isComplete());

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
