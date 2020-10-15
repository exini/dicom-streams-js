import assert from 'assert';
import { concatv, indeterminateLength, item, itemDelimitation, pipe, sequenceDelimitation } from '../src/base';
import {
    createFlow,
    DeferToPartFlow,
    dicomEndMarker,
    dicomStartMarker,
    EndEvent,
    GroupLengthWarnings,
    GuaranteedDelimitationEvents,
    GuaranteedValueEvent,
    IdentityFlow,
    InFragments,
    InSequence,
    StartEvent,
    TagPathTracking,
} from '../src/dicom-flow';
import { toIndeterminateLengthSequences } from '../src/dicom-flows';
import { parseFlow } from '../src/parse-flow';
import {
    DicomPart,
    ItemDelimitationPart,
    SequenceDelimitationPart,
    SequencePart,
    ValueChunk,
} from '../src/dicom-parts';
import { arraySink } from '../src/sinks';
import { singleSource } from '../src/sources';
import { Tag } from '../src/tag';
import { emptyTagPath, TagPath } from '../src/tag-path';
import * as data from './test-data';
import * as util from './test-util';

describe('The dicom flow', () => {
    it('should call the correct events for streamed dicom parts', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.patientNameJohnDoe(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        const testFlow = createFlow(
            new (class extends IdentityFlow {
                public onFragments(): DicomPart[] {
                    return [new util.TestPart('Fragments Start')];
                }
                public onHeader(): DicomPart[] {
                    return [new util.TestPart('Header')];
                }
                public onPreamble(): DicomPart[] {
                    return [new util.TestPart('Preamble')];
                }
                public onSequenceDelimitation(): DicomPart[] {
                    return [new util.TestPart('Sequence End')];
                }
                public onItemDelimitation(): DicomPart[] {
                    return [new util.TestPart('Item End')];
                }
                public onItem(): DicomPart[] {
                    return [new util.TestPart('Item Start')];
                }
                public onSequence(): DicomPart[] {
                    return [new util.TestPart('Sequence Start')];
                }
                public onValueChunk(): DicomPart[] {
                    return [new util.TestPart('Value Chunk')];
                }
                public onDeflatedChunk(): DicomPart[] {
                    return [];
                }
                public onUnknown(): DicomPart[] {
                    return [];
                }
                public onPart(): DicomPart[] {
                    return [];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            util.partProbe(parts)
                .expectTestPart('Preamble')
                .expectTestPart('Header')
                .expectTestPart('Value Chunk')
                .expectTestPart('Header')
                .expectTestPart('Value Chunk')
                .expectTestPart('Header')
                .expectTestPart('Value Chunk')
                .expectTestPart('Sequence Start')
                .expectTestPart('Item Start')
                .expectTestPart('Header')
                .expectTestPart('Value Chunk')
                .expectTestPart('Item End')
                .expectTestPart('Sequence End')
                .expectTestPart('Fragments Start')
                .expectTestPart('Item Start')
                .expectTestPart('Value Chunk')
                .expectTestPart('Sequence End')
                .expectDicomComplete();
        });
    });

    it('should emit errors properly', () => {
        const testFlow = createFlow(
            new (class extends DeferToPartFlow {
                public onPart(part: DicomPart): DicomPart[] {
                    if (part instanceof SequencePart) {
                        throw Error('Sequences not allowed in this flow');
                    }
                    return [part];
                }
            })(),
        );

        const bytes = concatv(
            data.patientNameJohnDoe(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
        );

        return util.expectDicomError(() =>
            util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
                // do nothing
            }),
        );
    });
});

describe('The in fragments flow', () => {
    it('should call onValueChunk callback also after length zero headers', () => {
        const bytes = concatv(
            data.patientNameJohnDoe(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        const expectedInFragments = [false, false, true];

        const testFlow = createFlow(
            new (class extends InFragments(IdentityFlow) {
                public onValueChunk(part: DicomPart): DicomPart[] {
                    assert.strictEqual(this.inFragments, expectedInFragments.shift());
                    return super.onValueChunk(part);
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            assert.strictEqual(expectedInFragments.length, 0);
        });
    });
});

describe('The guaranteed value flow', () => {
    it('should call onValueChunk callback also after length zero headers', () => {
        const bytes = concatv(data.patientNameJohnDoe(), data.emptyPatientName());

        const expectedChunkLengths = [8, 0];

        const testFlow = createFlow(
            new (class extends GuaranteedValueEvent(IdentityFlow) {
                public onValueChunk(part: ValueChunk): DicomPart[] {
                    assert.strictEqual(part.bytes.length, expectedChunkLengths.shift());
                    return super.onValueChunk(part);
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            assert.strictEqual(expectedChunkLengths.length, 0);
        });
    });

    it('should call event only once when flow is used twice', () => {
        const bytes = data.emptyPatientName();

        let nEvents = 0;

        const testFlow1 = createFlow(new (class extends GuaranteedValueEvent(IdentityFlow) {})());
        const testFlow2 = createFlow(
            new (class extends GuaranteedValueEvent(IdentityFlow) {
                public onValueChunk(part: ValueChunk): DicomPart[] {
                    nEvents += 1;
                    return super.onValueChunk(part);
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow1, testFlow2), () => {
            assert.strictEqual(nEvents, 1);
        });
    });
});

describe('The start event flow', () => {
    it('should notify when dicom stream starts', () => {
        const bytes = data.patientNameJohnDoe();

        const testFlow = createFlow(
            new (class extends StartEvent(IdentityFlow) {
                public onStart(): DicomPart[] {
                    return [dicomStartMarker];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            assert.strictEqual(parts[0], dicomStartMarker);
            assert.strictEqual(parts.length, 3);
        });
    });

    it('should call onStart for all combined flow stages', () => {
        const createTestFlow = (): any => {
            return createFlow(
                new (class extends StartEvent(DeferToPartFlow) {
                    private state = 1;

                    public onStart(): DicomPart[] {
                        this.state = 0;
                        return [];
                    }
                    public onPart(part: DicomPart): DicomPart[] {
                        assert.strictEqual(this.state, 0);
                        return [part];
                    }
                })(),
            );
        };

        return util.streamPromise(
            singleSource(dicomEndMarker, true),
            pipe(createTestFlow(), createTestFlow(), createTestFlow()),
            arraySink((parts) => {
                assert.strictEqual(parts.length, 1);
                assert.strictEqual(parts[0], dicomEndMarker);
            }),
        );
    });

    it('should call onStart once for flows with more than one capability using the onStart event', () => {
        const testFlow = createFlow(
            new (class extends StartEvent(GuaranteedDelimitationEvents(InFragments(DeferToPartFlow))) {
                private nCalls = 0;

                public onStart(): DicomPart[] {
                    this.nCalls += 1;
                    return [];
                }
                public onPart(part: DicomPart): DicomPart[] {
                    assert.strictEqual(this.nCalls, 1);
                    return [part];
                }
            })(),
        );

        return util.streamPromise(
            singleSource(dicomEndMarker, true),
            testFlow,
            arraySink((parts) => {
                assert.strictEqual(parts.length, 1);
                assert.strictEqual(parts[0], dicomEndMarker);
            }),
        );
    });
});

describe('The end event flow', () => {
    it('should notify when dicom stream ends', () => {
        const bytes = data.patientNameJohnDoe();

        const testFlow = createFlow(
            new (class extends EndEvent(IdentityFlow) {
                public onEnd(): DicomPart[] {
                    return [dicomEndMarker];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            assert.strictEqual(parts.length, 3);
            assert.strictEqual(parts[2], dicomEndMarker);
        });
    });
});

describe('The guaranteed delimitation flow', () => {
    it('should insert delimitation parts at the end of sequences and items with determinate length', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence, 56),
            item(16),
            data.studyDate(),
            item(),
            data.studyDate(),
            itemDelimitation(),
            data.sequence(Tag.AbstractPriorCodeSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            item(16),
            data.studyDate(),
            sequenceDelimitation(),
        );

        const expectedDelimitationLengths = [0, 8, 0, 8, 0, 8];

        const testFlow = createFlow(
            new (class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {
                public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
                    assert.strictEqual(part.bytes.length, expectedDelimitationLengths.shift());
                    return super.onItemDelimitation(part);
                }
                public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
                    assert.strictEqual(part.bytes.length, expectedDelimitationLengths.shift());
                    return super.onSequenceDelimitation(part);
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, 56)
                .expectItem(1, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                // .expectItemDelimitation() // delimitations not emitted by default
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                // .expectSequenceDelimitation()
                .expectSequence(Tag.AbstractPriorCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                // .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it('should handle sequences that end with an item delimitation', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence, 32),
            item(),
            data.studyDate(),
            itemDelimitation(),
        );

        const testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it('should work in datasets with nested sequences', () => {
        const bytes = concatv(
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence, 60),
            item(52),
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence, 24),
            item(16),
            data.studyDate(),
            data.patientNameJohnDoe(),
        );

        const testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should handle empty sequences and items', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence, 52),
            item(16),
            data.studyDate(),
            item(0),
            item(12),
            data.sequence(Tag.DerivationCodeSequence, 0),
        );

        const testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectItemDelimitation()
                .expectItem(3)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it('should handle empty elements in sequences', () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence, 44),
            item(36),
            data.emptyPatientName(),
            data.sequence(Tag.DerivationCodeSequence, 16),
            item(8),
            data.emptyPatientName(),
        );

        const testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it('should call event only once when used twice in flow', () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence, 24), item(16), data.patientNameJohnDoe());

        let nItemDelims = 0;
        let nSeqDelims = 0;

        const testFlow1 = createFlow(new (class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {})());
        const testFlow2 = createFlow(
            new (class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {
                public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
                    nItemDelims += 1;
                    return super.onItemDelimitation(part);
                }
                public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
                    nSeqDelims += 1;
                    return super.onSequenceDelimitation(part);
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow1, testFlow2), () => {
            assert.strictEqual(nItemDelims, 1);
            assert.strictEqual(nSeqDelims, 1);
        });
    });
});

describe('The InSequence support', () => {
    it('should keep track of sequence depth', () => {
        const expectedDepths = [0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0];

        const check = (depth: number, inSequence: boolean): void => {
            assert.strictEqual(depth, expectedDepths.shift());
            if (depth > 0) {
                assert(inSequence);
            } else {
                assert(!inSequence);
            }
        };

        const bytes = concatv(
            data.studyDate(),
            data.sequence(Tag.EnergyWindowInformationSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            item(), // sequence
            data.sequence(Tag.EnergyWindowRangeSequence, 24),
            item(16),
            data.studyDate(), // nested sequence (determinate length)
            itemDelimitation(),
            sequenceDelimitation(),
            data.patientNameJohnDoe(),
        ); // attribute

        const testFlow = createFlow(
            new (class extends GuaranteedValueEvent(
                InSequence(GuaranteedDelimitationEvents(InFragments(DeferToPartFlow))),
            ) {
                public onPart(part: DicomPart): DicomPart[] {
                    check(this.sequenceDepth(), this.inSequence());
                    return [part];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            // do nothing
        });
    });
});

describe('DICOM flows with tag path tracking', () => {
    it('should update the tag path through attributes, sequences and fragments', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(), // FMI
            data.studyDate(),
            data.sequence(Tag.EnergyWindowInformationSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            item(), // sequence
            data.sequence(Tag.EnergyWindowRangeSequence, 24),
            item(16),
            data.studyDate(), // nested sequence (determinate length)
            itemDelimitation(),
            sequenceDelimitation(),
            data.patientNameJohnDoe(), // attribute
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        const expectedPaths = [
            emptyTagPath, // preamble
            TagPath.fromTag(Tag.FileMetaInformationGroupLength), // FMI group length header
            TagPath.fromTag(Tag.FileMetaInformationGroupLength), // FMI group length value
            TagPath.fromTag(Tag.TransferSyntaxUID), // Transfer syntax header
            TagPath.fromTag(Tag.TransferSyntaxUID), // Transfer syntax value
            TagPath.fromTag(Tag.StudyDate), // Patient name header
            TagPath.fromTag(Tag.StudyDate), // Patient name value
            TagPath.fromSequence(Tag.EnergyWindowInformationSequence), // sequence start
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 1), // item start
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 1).thenTag(Tag.StudyDate), // study date header
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 1).thenTag(Tag.StudyDate), // study date value
            TagPath.fromItemEnd(Tag.EnergyWindowInformationSequence, 1), // item end
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2), // item start
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenSequence(Tag.EnergyWindowRangeSequence), // sequence start
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenItem(Tag.EnergyWindowRangeSequence, 1), // item start
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2)
                .thenItem(Tag.EnergyWindowRangeSequence, 1)
                .thenTag(Tag.StudyDate), // Study date header
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2)
                .thenItem(Tag.EnergyWindowRangeSequence, 1)
                .thenTag(Tag.StudyDate), // Study date value
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenItemEnd(Tag.EnergyWindowRangeSequence, 1), //  item end (inserted)
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenSequenceEnd(Tag.EnergyWindowRangeSequence), // sequence end (inserted)
            TagPath.fromItemEnd(Tag.EnergyWindowInformationSequence, 2), // item end
            TagPath.fromSequenceEnd(Tag.EnergyWindowInformationSequence), // sequence end
            TagPath.fromTag(Tag.PatientName), // Patient name header
            TagPath.fromTag(Tag.PatientName), // Patient name value
            TagPath.fromTag(Tag.PixelData), // fragments start
            TagPath.fromTag(Tag.PixelData), // item start
            TagPath.fromTag(Tag.PixelData), // fragment data
            TagPath.fromTag(Tag.PixelData),
        ]; // fragments end

        const check = (tagPath: TagPath): void => {
            assert(tagPath.isEqualTo(expectedPaths.shift()));
        };

        const testFlow = createFlow(
            new (class extends TagPathTracking(
                GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(DeferToPartFlow))),
            ) {
                public onPart(part: DicomPart): DicomPart[] {
                    check(this.tagPath);
                    return [part];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            // do nothing
        });
    });

    it('should support using tracking more than once within a flow', () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence, 24), item(16), data.patientNameJohnDoe());

        const createTestFlow = (): any => {
            return createFlow(
                new (class extends TagPathTracking(
                    GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow))),
                ) {})(),
            );
        };

        return util.testParts(bytes, pipe(parseFlow(), createTestFlow(), createTestFlow()), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should support sequences and items with explicit length', () => {
        const bytes = concatv(
            data.patientNameJohnDoe(),
            data.sequence(Tag.DigitalSignaturesSequence, 680),
            item(672),
            data.element(Tag.MACIDNumber, Buffer.from([1, 1])),
            data.element(Tag.DigitalSignatureUID, Buffer.from(new Array(54).fill('1'))),
            data.element(Tag.CertificateType, Buffer.from(new Array(14).fill('A'))),
            data.element(Tag.CertificateOfSigner, Buffer.from(new Array(426).fill(0))),
            data.element(Tag.Signature, Buffer.from(new Array(128).fill(0))),
        );

        const expectedPaths = [
            TagPath.fromTag(Tag.PatientName),
            TagPath.fromTag(Tag.PatientName),
            TagPath.fromSequence(Tag.DigitalSignaturesSequence), // sequence start
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1), // item start
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.MACIDNumber),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.MACIDNumber),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.DigitalSignatureUID),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.DigitalSignatureUID),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.CertificateType),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.CertificateType),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.CertificateOfSigner),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.CertificateOfSigner),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.Signature),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1).thenTag(Tag.Signature),
            TagPath.fromItemEnd(Tag.DigitalSignaturesSequence, 1), // item end (inserted)
            TagPath.fromSequenceEnd(Tag.DigitalSignaturesSequence),
        ]; // sequence end (inserted)

        const check = (tagPath: TagPath): void => {
            assert(tagPath.isEqualTo(expectedPaths.shift()));
        };

        const testFlow = createFlow(
            new (class extends TagPathTracking(
                GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow))),
            ) {
                public onPart(part: DicomPart): DicomPart[] {
                    check(this.tagPath);
                    return [part];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            // do nothing
        });
    });

    it('should handle elements, sequences and items of zero length', () => {
        const bytes = concatv(
            Buffer.from([8, 0, 32, 0, 68, 65, 0, 0]),
            data.patientNameJohnDoe(),
            data.sequence(Tag.MACParametersSequence, 0),
            data.sequence(Tag.WaveformSequence),
            sequenceDelimitation(),
            data.sequence(Tag.DigitalSignaturesSequence, 680),
            item(0),
            item(),
            itemDelimitation(),
            item(10),
            data.element(Tag.MACIDNumber, Buffer.from([1, 1])),
        );

        const expectedPaths = [
            TagPath.fromTag(Tag.StudyDate),
            TagPath.fromTag(Tag.StudyDate), // inserted
            TagPath.fromTag(Tag.PatientName),
            TagPath.fromTag(Tag.PatientName),
            TagPath.fromSequence(Tag.MACParametersSequence), // sequence start
            TagPath.fromSequenceEnd(Tag.MACParametersSequence), // sequence end (inserted)
            TagPath.fromSequence(Tag.WaveformSequence), // sequence start
            TagPath.fromSequenceEnd(Tag.WaveformSequence), // sequence end
            TagPath.fromSequence(Tag.DigitalSignaturesSequence), // sequence start
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 1), // item start
            TagPath.fromItemEnd(Tag.DigitalSignaturesSequence, 1), // item end (inserted)
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 2), // item start
            TagPath.fromItemEnd(Tag.DigitalSignaturesSequence, 2), // item end
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 3), // item start
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 3).thenTag(Tag.MACIDNumber),
            TagPath.fromItem(Tag.DigitalSignaturesSequence, 3).thenTag(Tag.MACIDNumber),
            TagPath.fromItemEnd(Tag.DigitalSignaturesSequence, 3), // item end (inserted)
            TagPath.fromSequenceEnd(Tag.DigitalSignaturesSequence),
        ]; // sequence end (inserted)

        const check = (tagPath: TagPath): void => {
            assert(tagPath.isEqualTo(expectedPaths.shift()));
        };

        const testFlow = createFlow(
            new (class extends TagPathTracking(
                GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow))),
            ) {
                public onPart(part: DicomPart): DicomPart[] {
                    check(this.tagPath);
                    return [part];
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            // do nothing
        });
    });
});

describe('The group length warnings flow', () => {
    it('should issue a warning when a group length attribute is encountered', () => {
        const bytes = concatv(
            data.preamble,
            data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(),
            data.groupLength(8, data.studyDate().length),
            data.studyDate(),
        );
        const warnFlow = createFlow(new (class extends GroupLengthWarnings(InFragments(IdentityFlow)) {})());

        return util.testParts(bytes, pipe(parseFlow(), warnFlow), (parts) => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(0x00080000)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should issue a warning when determinate length sequences and items are encountered', () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence, 24), item(16), data.studyDate());
        const warnFlow = createFlow(new (class extends GroupLengthWarnings(InFragments(IdentityFlow)) {})());

        return util.testParts(bytes, pipe(parseFlow(), warnFlow), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it('should not warn when silent', () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence, 24), item(16), data.studyDate());
        const warnFlow = createFlow(
            new (class extends GroupLengthWarnings(InFragments(IdentityFlow)) {
                constructor() {
                    super();
                    this.silent = true;
                }
            })(),
        );

        return util.testParts(bytes, pipe(parseFlow(), warnFlow), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});
