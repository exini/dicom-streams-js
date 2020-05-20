import assert from 'assert';
import { concatv, intToBytesLE, item, sequenceDelimitation } from '../src/base';
import { elementFlow } from '../src/element-flows';
import { elementSink } from '../src/element-sink';
import {
    FragmentElement,
    FragmentsElement,
    ItemDelimitationElement,
    ItemElement,
    SequenceDelimitationElement,
    SequenceElement,
    ValueElement,
} from '../src/dicom-elements';
import { parseFlow } from '../src/parse-flow';
import { arraySource, singleSource } from '../src/sources';
import { Tag } from '../src/tag';
import { UID } from '../src/uid';
import { Value } from '../src/value';
import { VR } from '../src/vr';
import * as data from './test-data';
import * as util from './test-util';

describe('An element sink', () => {
    it('aggregate streamed elements into an Elements', () => {
        const elementList = [
            new ValueElement(Tag.TransferSyntaxUID, VR.UI, Value.fromString(VR.UI, UID.ExplicitVRLittleEndian)),
            new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20040329')),
            new SequenceElement(Tag.DerivationCodeSequence),
            new ItemElement(1),
            new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20040329')),
            new ItemDelimitationElement(1),
            new ItemElement(2),
            new SequenceElement(Tag.DerivationCodeSequence),
            new ItemElement(1),
            new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20040329')),
            new ItemDelimitationElement(1),
            new SequenceDelimitationElement(),
            new ItemDelimitationElement(2),
            new SequenceDelimitationElement(),
            new ValueElement(Tag.PatientName, VR.PN, Value.fromString(VR.PN, 'Doe^John')),
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 4, Value.fromBytes(VR.OB, [1, 2, 3, 4])),
            new FragmentElement(2, 4, Value.fromBytes(VR.OB, [1, 2, 3, 4])),
            new SequenceDelimitationElement(),
        ];

        return util.streamPromise(
            arraySource(elementList, true),
            elementSink((elements) => {
                assert.deepStrictEqual(elements.toElements(false), elementList);
            }),
        );
    });

    it('should handle zero length values, fragments, sequences and items', () => {
        const elementList = [
            new ValueElement(Tag.StudyDate, VR.DA, Value.empty()),
            new SequenceElement(Tag.DerivationCodeSequence),
            new SequenceDelimitationElement(),
            new SequenceElement(Tag.DerivationCodeSequence, 0),
            new SequenceElement(Tag.DerivationCodeSequence),
            new ItemElement(1),
            new ItemDelimitationElement(1),
            new ItemElement(2, 0),
            new SequenceDelimitationElement(),
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 0, Value.empty()),
            new SequenceDelimitationElement(),
        ];

        return util.streamPromise(
            arraySource(elementList, true),
            elementSink((elements) => {
                assert.deepStrictEqual(elements.toElements(false), elementList);
            }),
        );
    });

    it('should handle sequences and items of determinate length', () => {
        const elementList = [
            new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20040329')),
            new SequenceElement(Tag.DerivationCodeSequence, 8 + 16 + 16),
            new ItemElement(1, 16 + 16),
            new ValueElement(Tag.StudyDate, VR.DA, Value.fromString(VR.DA, '20040329')),
            new ValueElement(Tag.PatientName, VR.DA, Value.fromString(VR.DA, 'Doe^John')),
            new ValueElement(Tag.PatientName, VR.DA, Value.fromString(VR.DA, 'Doe^John')),
        ];

        return util.streamPromise(
            arraySource(elementList, true),
            elementSink((elements) => {
                assert.deepStrictEqual(elements.toElements(false), elementList);
            }),
        );
    });

    it('should convert an empty offsets table item to an empty list of offsets', () => {
        const elementList = [
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 0, Value.empty()),
            new FragmentElement(2, 0, Value.fromBytes(VR.OB, [1, 2, 3, 4])),
            new SequenceDelimitationElement(),
        ];

        return util.streamPromise(
            arraySource(elementList, true),
            elementSink((elements) => {
                const fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert(fragments.offsets.length === 0);
            }),
        );
    });

    it('should map an offsets table to a list of offsets', () => {
        const elementList = [
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(
                1,
                0,
                Value.fromBuffer(VR.OB, concatv(intToBytesLE(1), intToBytesLE(2), intToBytesLE(3), intToBytesLE(4))),
            ),
            new SequenceDelimitationElement(),
        ];

        return util.streamPromise(
            arraySource(elementList, true),
            elementSink((elements) => {
                const fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert.deepStrictEqual(fragments.offsets, [1, 2, 3, 4]);
            }),
        );
    });
});

describe('Fragments', () => {
    it('should be empty', () => {
        const bytes = concatv(data.pixeDataFragments(), sequenceDelimitation());

        return util.streamPromise(
            singleSource(bytes),
            parseFlow(),
            elementFlow(),
            elementSink((elements) => {
                const fragments = elements.fragmentsByTag(Tag.PixelData);
                assert.strictEqual(fragments.size, 0);
                assert(fragments.offsets === undefined);
            }),
        );
    });

    it('should convert an empty first item to an empty offsets list', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(0),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        return util.streamPromise(
            singleSource(bytes),
            parseFlow(),
            elementFlow(),
            elementSink((elements) => {
                const fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert(fragments.offsets.length === 0);
                assert.strictEqual(fragments.size, 1);
            }),
        );
    });

    it('should convert first item to offsets', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(8),
            intToBytesLE(0),
            intToBytesLE(456),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            sequenceDelimitation(),
        );

        return util.streamPromise(
            singleSource(bytes),
            parseFlow(),
            elementFlow(),
            elementSink((elements) => {
                const fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert.deepStrictEqual(fragments.offsets, [0, 456]);
            }),
        );
    });
});
