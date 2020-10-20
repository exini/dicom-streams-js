import { Lookup } from '../src/lookup';
import { ValueElement } from '../src/dicom-elements';
import { Value } from '../src/value';
import {
    concat,
    concatv,
    intToBytes,
    item,
    itemDelimitation,
    pipe,
    sequenceDelimitation,
    sequenceDelimitationNonZeroLength,
    tagToBytes,
} from '../src/base';
import { parseFlow } from '../src/parse-flow';
import { Tag } from '../src/tag';
import { UID } from '../src/uid';
import { VR } from '../src/vr';
import { Chunker } from './chunker';
import * as data from './test-data';
import * as util from './test-util';

describe('DICOM parse flow', () => {
    it('should produce a preamble, FMI tags and dataset tags for a complete DICOM file', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should read files without preamble but with FMI', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should read a file with only FMI', () => {
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID());

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should read a file with neither FMI nor preamble', () => {
        const bytes = data.patientNameJohnDoe();

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts).expectHeader(Tag.PatientName).expectValueChunk().expectDicomComplete();
        });
    });

    it('should not output value chunks when value length is zero', () => {
        const bytes = Buffer.from([8, 0, 32, 0, 68, 65, 0, 0, 16, 0, 16, 0, 80, 78, 0, 0]);

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts).expectHeader(Tag.StudyDate).expectHeader(Tag.PatientName).expectDicomComplete();
        });
    });

    it('should output a warning message when file meta information group length is too long', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(), data.studyDate()),
            data.transferSyntaxUID(),
            data.studyDate(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should output a warning message when file meta information group length is too short', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.mediaStorageSOPInstanceUID()),
            data.mediaStorageSOPInstanceUID(),
            data.transferSyntaxUID(),
            data.studyDate(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.MediaStorageSOPInstanceUID)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should output a warning id when non-meta information is included in the header', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(), data.studyDate()),
            data.transferSyntaxUID(),
            data.studyDate(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should treat a preamble alone as a valid DICOM file', () => {
        const bytes = data.preamble;

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts).expectPreamble().expectDicomComplete();
        });
    });

    it('should skip very long (and obviously erroneous) transfer syntaxes (see warning log id)', () => {
        const tsuid = data.transferSyntaxUID();
        const malformedTsuid = concatv(
            tsuid.slice(0, 6),
            Buffer.from([20, 8]),
            tsuid.slice(tsuid.length - 20, tsuid.length),
            Buffer.from(new Array(2048).fill(0)),
        );
        const bytes = concatv(data.fmiGroupLength(malformedTsuid), malformedTsuid, data.patientNameJohnDoe());

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should fail reading a truncated DICOM file', () => {
        const bytes = data.patientNameJohnDoe().slice(0, 14);
        return util.expectDicomError(() =>
            util.testParts(bytes, parseFlow(), () => {
                // do nothing
            }),
        );
    });

    it('should handle odd-length attributes', () => {
        const element = (tag: number, value: string): Buffer =>
            new ValueElement(tag, Lookup.vrOf(tag), new Value(Buffer.from(value)), false, true).toBytes();

        const mediaSopUidOdd = element(
            Tag.MediaStorageSOPInstanceUID,
            '1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735',
        );
        const sopUidOdd = element(Tag.SOPInstanceUID, '1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735');
        const personNameOdd = element(Tag.PatientName, 'Jane^Mary');
        const bytes = concatv(
            data.fmiGroupLength(mediaSopUidOdd),
            mediaSopUidOdd,
            sopUidOdd,
            data.sequence(Tag.DerivationCodeSequence, 25),
            item(17),
            personNameOdd,
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength, VR.UL, 4)
                .expectValueChunk()
                .expectHeader(Tag.MediaStorageSOPInstanceUID, VR.UI, 55)
                .expectValueChunk(Buffer.from('1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735'))
                .expectHeader(Tag.SOPInstanceUID, VR.UI, 55)
                .expectValueChunk(Buffer.from('1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735'))
                .expectSequence(Tag.DerivationCodeSequence, 25)
                .expectItem(1, 17)
                .expectHeader(Tag.PatientName, VR.PN, 9)
                .expectValueChunk(Buffer.from('Jane^Mary'))
                .expectDicomComplete();
        });
    });

    it('should inflate deflated datasets', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(concatv(data.patientNameJohnDoe(), data.studyDate())),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should inflate gzip deflated datasets (with warning id)', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(concatv(data.patientNameJohnDoe(), data.studyDate()), true),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should pass through deflated data when asked not to inflate', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(concatv(data.patientNameJohnDoe(), data.studyDate())),
        );

        return util.testParts(bytes, parseFlow(8192, false), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDeflatedChunk()
                .expectDicomComplete();
        });
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

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should issue a warning when a fragments delimitation tag has nonzero length', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            item(4),
            Buffer.from([5, 6, 7, 8]),
            sequenceDelimitationNonZeroLength(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should read DICOM data containing a sequence', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

        return util.testParts(bytes, parseFlow(), (parts) => {
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
                .expectDicomComplete();
        });
    });

    it('should read a valid DICOM file correctly when data chunks are very small', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

        const chunker = new Chunker(1);
        const flow = pipe(chunker, parseFlow());

        return util.testParts(bytes, flow, (parts) => {
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

    it('should not accept a non-DICOM file', () => {
        const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        return util.expectDicomError(() =>
            util.testParts(bytes, parseFlow(), () => {
                // do nothing
            }),
        );
    });

    it('should read DICOM files with explicit VR big-endian transfer syntax', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired)),
            data.transferSyntaxUID(UID.ExplicitVRBigEndianRetired),
            data.patientNameJohnDoe(true),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should read DICOM files with implicit VR little endian transfer syntax', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID(UID.ImplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.ImplicitVRLittleEndian),
            data.patientNameJohnDoe(false, false),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
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

    it('should chunk value data according to max chunk size', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
        );

        return util.testParts(bytes, parseFlow(5), (parts) => {
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

    it('should chunk deflated data according to max chunk size', () => {
        const bytes = concatv(
            data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)),
            data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian),
            util.deflate(data.patientNameJohnDoe()),
            data.studyDate(),
        );

        return util.testParts(bytes, parseFlow(22, false), (parts) => {
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

    it('should accept meta information encoded with implicit VR', () => {
        const bytes = concatv(
            data.preamble,
            data.transferSyntaxUID(UID.ExplicitVRLittleEndian, false, false),
            data.patientNameJohnDoe(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should handle values with length larger than the signed int range', () => {
        const length = 0x80000000;
        const bytes = concat(Buffer.from([0xe0, 0x7f, 0x10, 0x00, 0x4f, 0x57, 0, 0]), intToBytes(length, false));

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts).expectHeader(Tag.PixelData, VR.OW, length).expectDicomComplete();
        });
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

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
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
    });

    it('should handle fragments with empty basic offset table (first item)', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(0),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectFragments()
                .expectFragment(1, 0)
                .expectFragment(2, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectDicomComplete();
        });
    });

    it('should parse sequences with VR UN as a block of bytes', () => {
        const unSequence = concatv(
            tagToBytes(Tag.CTExposureSequence),
            Buffer.from('UN'),
            Buffer.from([0, 0]),
            intToBytes(24),
        );
        const bytes = concatv(data.patientNameJohnDoe(), unSequence, item(16), data.studyDate());

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should parse sequences with VR UN, and where the nested data set(s) have implicit VR, as a block of bytes', () => {
        const unSequence = concatv(
            tagToBytes(Tag.CTExposureSequence),
            Buffer.from('UN'),
            Buffer.from([0, 0]),
            intToBytes(24),
        );
        const bytes = concatv(data.patientNameJohnDoe(), unSequence, item(16), data.studyDate(false, false));

        return util.testParts(bytes, parseFlow(), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.CTExposureSequence, VR.UN, 24)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});
