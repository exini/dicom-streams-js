const assert = require("assert");
const base = require("../src/base");
const {Value} = require("../src/value");
const {ValueElement, SequenceElement, FragmentElement, FragmentsElement, ItemElement, ItemDelimitationElement, SequenceDelimitationElement} = require("../src/elements");
const VR = require("../src/vr");
const UID = require("../src/uid");
const {parseFlow} = require("../src/dicom-parser");
const {elementFlow} = require("../src/element-flows");
const {elementSink} = require("../src/element-sink");
const data = require("./test-data");
const util = require("./util");

describe("An element sink", function () {

    it("aggregate streamed elements into an Elements", function () {
        let elementList = [
            new ValueElement(Tag.TransferSyntaxUID, VR.UI, new Value(Buffer.from(UID.ExplicitVRLittleEndian))),
            new ValueElement(Tag.StudyDate, VR.DA, new Value(Buffer.from("20040329"))),
            new SequenceElement(Tag.DerivationCodeSequence),
            new ItemElement(1),
            new ValueElement(Tag.StudyDate, VR.DA, new Value(Buffer.from("20040329"))),
            new ItemDelimitationElement(1),
            new ItemElement(2),
            new SequenceElement(Tag.DerivationCodeSequence),
            new ItemElement(1),
            new ValueElement(Tag.StudyDate, VR.DA, new Value(Buffer.from("20040329"))),
            new ItemDelimitationElement(1),
            new SequenceDelimitationElement(),
            new ItemDelimitationElement(2),
            new SequenceDelimitationElement(),
            new ValueElement(Tag.PatientName, VR.PN, new Value(Buffer.from("Doe^John"))),
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 4, new Value(Buffer.from([1, 2, 3, 4]))),
            new FragmentElement(2, 4, new Value(Buffer.from([1, 2, 3, 4]))),
            new SequenceDelimitationElement()
        ];

        return util.streamPromise(
            util.arraySource(elementList, 0, true),
            elementSink(elements => {
                assert.deepEqual(elements.toElements(), elementList);
            }));
    });

    it("should handle zero length values, fragments, sequences and items", function () {
        let elementList = [
            new ValueElement(Tag.StudyDate, VR.DA, new Value(base.emptyBuffer)),
            new SequenceElement(Tag.DerivationCodeSequence),
            new SequenceDelimitationElement(),
            new SequenceElement(Tag.DerivationCodeSequence, 0),
            new SequenceDelimitationElement(true),
            new SequenceElement(Tag.DerivationCodeSequence),
            new ItemElement(1),
            new ItemDelimitationElement(1),
            new ItemElement(2, 0),
            new ItemDelimitationElement(2, true),
            new SequenceDelimitationElement(),
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 0, new Value(base.emptyBuffer)),
            new SequenceDelimitationElement(),
            new FragmentsElement(Tag.PixelData, VR.OB),
            new SequenceDelimitationElement()
        ];

        return util.streamPromise(
            util.arraySource(elementList, 0, true),
            elementSink(elements => {
                assert.deepEqual(elements.toElements(), elementList);
            }));
    });

    it("should convert an empty offsets table item to an empty list of offsets", function () {
        let elementList = [
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 0, new Value(base.emptyBuffer)),
            new FragmentElement(2, 0, new Value(Buffer.from([1, 2, 3, 4]))),
            new SequenceDelimitationElement()
        ];

        return util.streamPromise(
            util.arraySource(elementList, 0, true),
            elementSink(elements => {
                let fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert(fragments.offsets.length === 0);
            }));
    });

    it("should map an offsets table to a list of offsets", function () {
        let elementList = [
            new FragmentsElement(Tag.PixelData, VR.OB),
            new FragmentElement(1, 0, new Value(base.concatv(base.intToBytesLE(1), base.intToBytesLE(2),
                base.intToBytesLE(3), base.intToBytesLE(4)))),
            new SequenceDelimitationElement()
        ];

        return util.streamPromise(
            util.arraySource(elementList, 0, true),
            elementSink(elements => {
                let fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert.deepEqual(fragments.offsets, [1, 2, 3, 4]);
            }));
    });
});

describe("Fragments", function () {

    it("should be empty", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.sequenceDelimitation());

        return util.streamPromise(
            util.singleSource(bytes),
            parseFlow(),
            elementFlow(),
            elementSink(elements => {
                let fragments = elements.fragmentsByTag(Tag.PixelData);
                assert.equal(fragments.size, 0);
                assert(fragments.offset === undefined);
            }));
    });

    it("should convert an empty first item to an empty offsets list", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(0), base.item(4),
            Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        return util.streamPromise(
            util.singleSource(bytes),
            parseFlow(),
            elementFlow(),
            elementSink(elements => {
                let fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert(fragments.offsets.length === 0);
                assert.equal(fragments.size, 1);
            }));
    });

    it("should convert first item to offsets", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(8), base.intToBytesLE(0),
            base.intToBytesLE(456), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        return util.streamPromise(
            util.singleSource(bytes),
            parseFlow(),
            elementFlow(),
            elementSink(elements => {
                let fragments = elements.fragmentsByTag(Tag.PixelData);
                assert(fragments.offsets !== undefined);
                assert.deepEqual(fragments.offsets, [0, 456]);
            }));
    });
});
