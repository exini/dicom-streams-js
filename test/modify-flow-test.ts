import {
    concat,
    concatv,
    emptyBuffer,
    item,
    itemDelimitation,
    pipe,
    sequenceDelimitation,
    shortToBytesLE,
    tagToBytesLE,
} from '../src/base';
import { prependFlow } from '../src/flows';
import { modifyFlow, TagInsertion, TagModification, TagModificationsPart } from '../src/modify-flow';
import { parseFlow } from '../src/parse-flow';
import { Tag } from '../src/tag';
import { TagPath } from '../src/tag-path';
import { TagTree } from '../src/tag-tree';
import { VR } from '../src/vr';
import * as data from './test-data';
import * as util from './test-util';

describe('The modify flow', () => {
    it('should modify the value of the specified elements', () => {
        const bytes = concat(data.studyDate(), data.patientNameJohnDoe());

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow([
                    TagModification.equals(TagPath.fromTag(Tag.StudyDate), () => emptyBuffer),
                    TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes),
                ]),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, 0)
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk()
                    .expectDicomComplete();
            },
        );
    });

    it('should not modify elements in datasets other than the dataset the tag path points to', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(parseFlow(), modifyFlow([TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes)])),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectItem()
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should insert elements if not present', () => {
        const bytes = concatv(data.patientNameJohnDoe());

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.StudyDate), () => data.studyDate().slice(8))]),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                    .expectValueChunk(data.studyDate().slice(8))
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectDicomComplete();
            },
        );
    });

    it('should insert elements if not present also at end of dataset', () => {
        const bytes = concatv(data.studyDate());

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                    .expectValueChunk(data.studyDate().slice(8))
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectDicomComplete();
            },
        );
    });

    it('should insert elements if not present also at end of dataset when last element is empty', () => {
        const bytes = concatv(tagToBytesLE(0x00080050), Buffer.from('SH'), shortToBytesLE(0x0000));

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.SOPInstanceUID), () => Buffer.from('1.2.3.4 '))]),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.SOPInstanceUID, VR.UI, 8)
                    .expectValueChunk()
                    .expectHeader(Tag.AccessionNumber, VR.SH, 0)
                    .expectDicomComplete();
            },
        );
    });

    it('should insert elements between a normal attribute and a sequence', () => {
        const bytes = concatv(data.studyDate(), data.sequence(Tag.AbstractPriorCodeSequence), sequenceDelimitation());

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                    .expectValueChunk(data.studyDate().slice(8))
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectSequence(Tag.AbstractPriorCodeSequence)
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should insert elements between a sequence and a normal attribute', () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence), sequenceDelimitation(), data.patientID());

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectSequenceDelimitation()
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectHeader(Tag.PatientID, VR.LO, data.patientID().length - 8)
                    .expectValueChunk(data.patientID().slice(8))
                    .expectDicomComplete();
            },
        );
    });

    it('should insert elements between two sequences', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            sequenceDelimitation(),
            data.sequence(Tag.AbstractPriorCodeSequence),
            sequenceDelimitation(),
        );

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [new TagInsertion(TagPath.fromTag(Tag.PatientName), () => data.patientNameJohnDoe().slice(8))],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectSequenceDelimitation()
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectSequence(Tag.AbstractPriorCodeSequence)
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it("should modify, not insert, when 'insert' elements are already present", () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe());

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [
                        new TagInsertion(TagPath.fromTag(Tag.StudyDate), () => emptyBuffer),
                        new TagInsertion(TagPath.fromTag(Tag.PatientName), () => mikeBytes),
                    ],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, 0)
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk(mikeBytes)
                    .expectDicomComplete();
            },
        );
    });

    it("should modify based on current value, when 'insert' elements are already present", () => {
        const bytes = data.patientNameJohnDoe();

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [new TagInsertion(TagPath.fromTag(Tag.PatientName), (b) => concat(b, Buffer.from(' Senior ')))],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.PatientName, VR.PN, 16)
                    .expectValueChunk(Buffer.from('John^Doe Senior '))
                    .expectDicomComplete();
            },
        );
    });

    it('should insert all relevant elements below the current tag number', () => {
        const bytes = data.patientNameJohnDoe();

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [
                        new TagInsertion(TagPath.fromTag(Tag.SeriesDate), () => data.studyDate().slice(8)),
                        new TagInsertion(TagPath.fromTag(Tag.StudyDate), () => data.studyDate().slice(8)),
                    ],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, data.studyDate().length - 8)
                    .expectValueChunk(data.studyDate().slice(8))
                    .expectHeader(Tag.SeriesDate, VR.DA, data.studyDate().length - 8)
                    .expectValueChunk(data.studyDate().slice(8))
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().length - 8)
                    .expectValueChunk(data.patientNameJohnDoe().slice(8))
                    .expectDicomComplete();
            },
        );
    });

    it('should not insert elements if dataset contains no elements', () => {
        return util.testParts(
            emptyBuffer,
            pipe(
                parseFlow(),
                modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.SeriesDate), () => data.studyDate().slice(8))]),
            ),
            (parts) => {
                util.partProbe(parts).expectDicomComplete();
            },
        );
    });

    it('should insert elements in sequences if sequence is present but element is not present', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [
                        new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate), () =>
                            data.studyDate().slice(8),
                        ),
                    ],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectItem()
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk()
                    .expectHeader(Tag.PatientName)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should skip inserting elements in missing sequences', () => {
        const bytes = concatv(data.patientNameJohnDoe());

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [
                        new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate), () =>
                            data.studyDate().slice(8),
                        ),
                        new TagInsertion(
                            TagPath.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName),
                            () => emptyBuffer,
                        ),
                    ],
                ),
            ),
            (parts) => {
                util.partProbe(parts).expectHeader(Tag.PatientName).expectValueChunk().expectDicomComplete();
            },
        );
    });

    it('should not insert unknown elements', () => {
        const bytes = concatv(data.patientNameJohnDoe());

        return util.expectDicomError(() =>
            util.testParts(
                bytes,
                pipe(
                    parseFlow(),
                    modifyFlow([], [new TagInsertion(TagPath.fromTag(0x00200021), () => Buffer.from([1, 2, 3, 4]))]),
                ),
                (parts) => {
                    util.partProbe(parts).expectHeader(Tag.PatientName).expectValueChunk();
                },
            ),
        );
    });

    it('should not insert sequences', () => {
        const bytes = concatv(data.patientNameJohnDoe());

        return util.expectDicomError(() =>
            util.testParts(
                bytes,
                pipe(
                    parseFlow(),
                    modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.DerivationCodeSequence), () => emptyBuffer)]),
                ),
                () => {
                    // do nothing
                },
            ),
        );
    });

    it('should insert into the correct sequence item', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow(
                    [],
                    [
                        new TagInsertion(TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.StudyDate), () =>
                            data.studyDate().slice(8),
                        ),
                    ],
                ),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectItem()
                    .expectHeader(Tag.PatientName)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectItem()
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk()
                    .expectHeader(Tag.PatientName)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should modify the correct sequence item', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                modifyFlow([
                    TagModification.equals(
                        TagPath.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.PatientName),
                        () => mikeBytes,
                    ),
                ]),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectItem()
                    .expectHeader(Tag.PatientName, VR.PN, data.patientNameJohnDoe().slice(8).length)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectItem()
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should modify all sequence items', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            item(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        const mikeBytes = Buffer.from('Mike');
        const tagTree = TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.PatientName);

        return util.testParts(
            bytes,
            pipe(parseFlow(), modifyFlow([new TagModification(tagTree.hasPath.bind(tagTree), () => mikeBytes)])),
            (parts) => {
                util.partProbe(parts)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectItem()
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectItem()
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should correctly sort elements with high tag numbers', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            Buffer.from([0xff, 0xff, 0xff, 0xff, 68, 65, 10, 0, 49, 56, 51, 49, 51, 56, 46, 55, 54, 53]),
        );

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(parseFlow(), modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.PatientName), () => mikeBytes)])),
            (parts) => {
                util.partProbe(parts)
                    .expectPreamble()
                    .expectHeader(Tag.FileMetaInformationGroupLength)
                    .expectValueChunk()
                    .expectHeader(Tag.TransferSyntaxUID)
                    .expectValueChunk()
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk()
                    .expectHeader(0xffffffff, VR.DA, 10)
                    .expectValueChunk()
                    .expectDicomComplete();
            },
        );
    });

    it('should work also with the endsWith modification matcher', () => {
        const bytes = concatv(
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.studyDate(),
            data.patientNameJohnDoe(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        const studyBytes = Buffer.from('2012-01-01');

        return util.testParts(
            bytes,
            pipe(parseFlow(), modifyFlow([TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), () => studyBytes)])),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk(studyBytes)
                    .expectSequence(Tag.DerivationCodeSequence)
                    .expectItem()
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk(studyBytes)
                    .expectHeader(Tag.PatientName)
                    .expectValueChunk()
                    .expectItemDelimitation()
                    .expectSequenceDelimitation()
                    .expectDicomComplete();
            },
        );
    });

    it('should pick up tag modifications from the stream', () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe());

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                prependFlow(
                    new TagModificationsPart([
                        TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes),
                    ]),
                    true,
                ),
                modifyFlow([TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), () => emptyBuffer)]),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate, VR.DA, 0)
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk(mikeBytes)
                    .expectDicomComplete();
            },
        );
    });

    it('should pick up tag modifications and replace old modifications', () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe());

        const mikeBytes = Buffer.from('Mike');

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                prependFlow(
                    new TagModificationsPart(
                        [TagModification.equals(TagPath.fromTag(Tag.PatientName), () => mikeBytes)],
                        [],
                        true,
                    ),
                    true,
                ),
                modifyFlow([TagModification.endsWith(TagPath.fromTag(Tag.StudyDate), () => emptyBuffer)]),
            ),
            (parts) => {
                util.partProbe(parts)
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk()
                    .expectHeader(Tag.PatientName, VR.PN, mikeBytes.length)
                    .expectValueChunk(mikeBytes)
                    .expectDicomComplete();
            },
        );
    });

    it('should not emit sequence and item delimiters for data with explicit length sequences and items', () => {
        const bytes = concatv(
            data.patientNameJohnDoe(),
            data.sequence(Tag.DerivationCodeSequence, 24),
            item(16),
            data.studyDate(),
        );

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([], [], false)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});
