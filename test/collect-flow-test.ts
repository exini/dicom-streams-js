import assert from 'assert';
import { ElementsPart, TagTree } from '../src';
import { concat, concatv, emptyBuffer, pipe, item, itemDelimitation, sequenceDelimitation } from '../src/base';
import { collectFlow, collectFromTagPathsFlow } from '../src/collect-flow';
import { parseFlow } from '../src/parse-flow';
import { Tag } from '../src/tag';
import * as data from './test-data';
import * as util from './test-util';

describe('A collect elements flow', () => {
    it('should first produce an elements part followed by the input dicom parts', () => {
        const bytes = concat(data.studyDate(), data.patientNameJohnDoe());
        const tags = [Tag.StudyDate, Tag.PatientName].map(TagTree.fromTag);
        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow(tags, 'tag')), (parts) => {
            const e = parts.shift() as ElementsPart;
            assert.strictEqual(e.label, 'tag');
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

    it('should produce an empty elements part when stream is empty', () => {
        const bytes = emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), collectFromTagPathsFlow([], 'tag')), (parts) => {
            const e = parts.shift() as ElementsPart;
            assert(e.elements.isEmpty());

            util.partProbe(parts).expectDicomComplete();
        });
    });

    it('should produce an empty elements part when no relevant data elements are present', () => {
        const bytes = concat(data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(
            bytes,
            pipe(
                parseFlow(),
                collectFromTagPathsFlow([Tag.Modality, Tag.SeriesInstanceUID].map(TagTree.fromTag), 'tag'),
            ),
            (parts) => {
                const e = parts.shift() as ElementsPart;
                assert(e.elements.isEmpty());

                util.partProbe(parts)
                    .expectHeader(Tag.PatientName)
                    .expectValueChunk()
                    .expectHeader(Tag.StudyDate)
                    .expectValueChunk()
                    .expectDicomComplete();
            },
        );
    });

    it('should apply the stop tag appropriately', () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe(), data.pixelData(2000));

        return util.testParts(
            bytes,
            pipe(parseFlow(500), collectFromTagPathsFlow([Tag.StudyDate, Tag.PatientName].map(TagTree.fromTag), 'tag')),
            (parts) => {
                const e = parts.shift() as ElementsPart;
                assert.strictEqual(e.label, 'tag');
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
            },
        );
    });

    it('should fail if max buffer size is exceeded', () => {
        const bytes = concatv(data.studyDate(), data.patientNameJohnDoe(), data.pixelData(2000));

        return util.expectDicomError(() =>
            util.testParts(
                bytes,
                pipe(
                    parseFlow(500),
                    collectFlow(
                        (tagPath) => tagPath.tag() === Tag.PatientName,
                        (tagPath) => tagPath.tag() > Tag.PixelData,
                        'tag',
                        1000,
                    ),
                ),
                () => {
                    // do nothing
                },
            ),
        );
    });

    it('should collect attributes in sequences', () => {
        const bytes = concatv(
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence, 8 + 16 + 12 + 8 + 16 + 8 + 8 + 16),
            item(16 + 12 + 8 + 16 + 8 + 8 + 16),
            data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence),
            item(),
            data.studyDate(),
            itemDelimitation(),
            sequenceDelimitation(),
            data.patientNameJohnDoe(),
            data.patientID(),
        );

        util.testParts(
            bytes,
            pipe(
                parseFlow(500),
                collectFromTagPathsFlow(
                    [TagTree.fromTag(Tag.PatientID), TagTree.fromItem(Tag.DerivationCodeSequence, 1)],
                    'tag',
                ),
            ),
            (parts) => {
                const e = parts.shift() as ElementsPart;
                assert.strictEqual(e.label, 'tag');
                assert.strictEqual(e.elements.size, 2);
                assert(e.elements.elementByTag(Tag.PatientID) !== undefined);
                assert(e.elements.elementByTag(Tag.DerivationCodeSequence) !== undefined);
                assert.strictEqual(e.elements.sequenceByTag(Tag.DerivationCodeSequence).item(1).elements.size, 3);
            },
        );
    });

    it('should collect fragments', () => {
        const bytes = concatv(
            data.studyDate(),
            data.pixeDataFragments(),
            item(4),
            new Buffer([1, 2, 3, 4]),
            item(4),
            new Buffer([5, 6, 7, 8]),
            sequenceDelimitation(),
        );

        util.testParts(
            bytes,
            pipe(parseFlow(500), collectFromTagPathsFlow([TagTree.fromTag(Tag.PixelData)], 'tag')),
            (parts) => {
                const e = parts.shift() as ElementsPart;
                assert.strictEqual(e.label, 'tag');
                assert.strictEqual(e.elements.size, 1);
                const f = e.elements.fragmentsByTag(Tag.PixelData);
                assert(f !== undefined);
                assert.strictEqual(f.offsets.length, 1);
                assert.strictEqual(f.fragments.length, 1);
            },
        );
    });
});
