const fs = require("fs");
const pipe = require("multipipe");
const assert = require("assert");
const base = require("../src/base");
const Tag = require("../src/tag");
const {TagPath, emptyTagPath} = require("../src/tag-path");
const {SequencePart} = require("../src/parts");
const {parseFlow} = require("../src/dicom-parser");
const {create, IdentityFlow, DeferToPartFlow, StartEvent, EndEvent, InFragments, InSequence, GuaranteedValueEvent,
    GuaranteedDelimitationEvents, TagPathTracking, dicomStartMarker, dicomEndMarker} = require("../src/dicom-flow");
const {toIndeterminateLengthSequences} = require("../src/dicom-flows");
const data = require("./test-data");
const util = require("./util");

describe("The dicom flow", function () {
    it("should call the correct events for streamed dicom parts", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(), data.studyDate(),
            base.itemDelimitation(), base.sequenceDelimitation(), data.pixeDataFragments(), base.item(4),
            Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        let testFlow = create(new class extends IdentityFlow {
            onFragments() { return [new util.TestPart("Fragments Start")]; }
            onHeader() { return [new util.TestPart("Header")]; }
            onPreamble() { return [new util.TestPart("Preamble")]; }
            onSequenceDelimitation() { return [new util.TestPart("Sequence End")]; }
            onItemDelimitation() { return [new util.TestPart("Item End")]; }
            onItem() { return [new util.TestPart("Item Start")]; }
            onSequence() { return [new util.TestPart("Sequence Start")]; }
            onValueChunk() { return [new util.TestPart("Value Chunk")]; }
            onDeflatedChunk() { return []; }
            onUnknown() { return []; }
            onPart() { return []; }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
            util.partProbe(parts)
                .expectTestPart("Preamble")
                .expectTestPart("Header")
                .expectTestPart("Value Chunk")
                .expectTestPart("Header")
                .expectTestPart("Value Chunk")
                .expectTestPart("Header")
                .expectTestPart("Value Chunk")
                .expectTestPart("Sequence Start")
                .expectTestPart("Item Start")
                .expectTestPart("Header")
                .expectTestPart("Value Chunk")
                .expectTestPart("Item End")
                .expectTestPart("Sequence End")
                .expectTestPart("Fragments Start")
                .expectTestPart("Item Start")
                .expectTestPart("Value Chunk")
                .expectTestPart("Sequence End")
                .expectDicomComplete()
        });
    });

    it("should emit errors properly", function () {
        let testFlow = create(new class extends DeferToPartFlow {
            onPart(part) {
                if (part instanceof SequencePart)
                    throw Error("Sequences not allowed in this flow");
                return [part];
            }
        });

        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(),
            data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), testFlow), () => {}));
    });
});

describe("The in fragments flow", function () {
    it("should call onValueChunk callback also after length zero headers", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(), data.studyDate(),
            base.itemDelimitation(), base.sequenceDelimitation(), data.pixeDataFragments(), base.item(4),
            Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        let expectedInFragments = [false, false, true];

        let testFlow = create(new class extends InFragments(IdentityFlow) {
            onValueChunk(part) {
                assert.equal(this.inFragments, expectedInFragments.shift());
                return super.onValueChunk(part);
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            assert.equal(expectedInFragments.length, 0);
        });
    });
});

describe("The guaranteed value flow", function () {
    it("should call onValueChunk callback also after length zero headers", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.emptyPatientName());

        let expectedChunkLengths = [8, 0];

        let testFlow = create(new class extends GuaranteedValueEvent(IdentityFlow) {
            onValueChunk(part) {
                assert.equal(part.bytes.length, expectedChunkLengths.shift());
                return super.onValueChunk(part);
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
            assert.equal(expectedChunkLengths.length, 0);
        });
    });

    it("should call event only once when flow is used twice", function () {
        let bytes = data.emptyPatientName();

        let nEvents = 0;

        let testFlow1 = create(new class extends GuaranteedValueEvent(IdentityFlow) {});
        let testFlow2 = create(new class extends GuaranteedValueEvent(IdentityFlow) {
            onValueChunk(part) {
                nEvents += 1;
                return super.onValueChunk(part);
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow1, testFlow2), () => {
            assert.equal(nEvents, 1);
        });
    });

});

describe("The start event flow", function () {
    it("should notify when dicom stream starts", function () {
        let bytes = data.patientNameJohnDoe();

        let testFlow = create(new class extends StartEvent(IdentityFlow) {
            onStart() {
                return [dicomStartMarker];
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
            assert.equal(parts[0], dicomStartMarker);
            assert.equal(parts.length, 3);
        });

    });

    it("should call onStart for all combined flow stages", function () {
        let createTestFlow = function () {
            return create(new class extends StartEvent(DeferToPartFlow) {
                constructor() {
                    super();
                    this.state = 1;
                }

                onStart() {
                    this.state = 0;
                    return [];
                }
                onPart(part) {
                    assert.equal(this.state, 0);
                    return [part];
                }
            });
        };

        return util.streamPromise(
            util.singleSource(dicomEndMarker, 0, true),
            pipe(createTestFlow(), createTestFlow(), createTestFlow()),
            util.arraySink(parts => {
                assert.equal(parts.length, 1);
                assert.equal(parts[0], dicomEndMarker);
            }));
    });

    it("should call onStart once for flows with more than one capability using the onStart event", function () {
        let testFlow = create(new class extends StartEvent(GuaranteedDelimitationEvents(InFragments(DeferToPartFlow))) {
            constructor() {
                super();
                this.nCalls = 0;
            }

            onStart() {
                this.nCalls += 1;
                return [];
            }
            onPart(part) {
                assert.equal(this.nCalls, 1);
                return [part];
            }
        });

        return util.streamPromise(
            util.singleSource(dicomEndMarker, 0, true), testFlow, util.arraySink(parts => {
                assert.equal(parts.length, 1);
                assert.equal(parts[0], dicomEndMarker);
            }));

    });
});

describe("The end event flow", function () {
    it("should notify when dicom stream ends", function () {
        let bytes = data.patientNameJohnDoe();

        let testFlow = create(new class extends EndEvent(IdentityFlow) {
            onEnd() {
                return [dicomEndMarker];
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
            assert.equal(parts.length, 3);
            assert.equal(parts[2], dicomEndMarker);
        });
    });
});

describe("The guaranteed delimitation flow", function () {
    it("should insert delimitation parts at the end of sequences and items with determinate length", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 56), base.item(16), data.studyDate(),
            base.item(), data.studyDate(), base.itemDelimitation(), data.sequence(Tag.AbstractPriorCodeSequence), base.item(),
            data.studyDate(), base.itemDelimitation(), base.item(16), data.studyDate(), base.sequenceDelimitation());

        let expectedDelimitationLengths = [0, 8, 0, 8, 0, 8];

        let testFlow = create(new class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {
            onItemDelimitation(part) {
                assert.equal(part.bytes.length, expectedDelimitationLengths.shift());
                return super.onItemDelimitation(part);
            }
            onSequenceDelimitation(part) {
                assert.equal(part.bytes.length, expectedDelimitationLengths.shift());
                return super.onSequenceDelimitation(part);
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, 56)
                .expectItem(1, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                //.expectItemDelimitation() // delimitations not emitted by default
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                //.expectSequenceDelimitation()
                .expectSequence(Tag.AbstractPriorCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2, 16)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                //.expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete()
        });
    });

    it("should handle sequences that end with an item delimitation", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 32), base.item(), data.studyDate(), base.itemDelimitation());

        let testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
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

    it("should work in datasets with nested sequences", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 60), base.item(52),
            data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.studyDate(),
            data.patientNameJohnDoe());

        let testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
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
                .expectDicomComplete()
        });
    });

    it("should handle empty sequences and items", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 52), base.item(16),
            data.studyDate(), base.item(0), base.item(12), data.sequence(Tag.DerivationCodeSequence, 0));

        let testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
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
                .expectDicomComplete()
        });
    });

    it("should handle empty elements in sequences", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 44), base.item(36),
            data.emptyPatientName(), data.sequence(Tag.DerivationCodeSequence, 16), base.item(8),
            data.emptyPatientName());

        let testFlow = toIndeterminateLengthSequences();

        return util.testParts(bytes, pipe(parseFlow(), testFlow), parts => {
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
                .expectDicomComplete()
        });
    });

    it("should call event only once when used twice in flow", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.patientNameJohnDoe());

        let nItemDelims = 0;
        let nSeqDelims = 0;

        let testFlow1 = create(new class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {});
        let testFlow2 = create(new class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {
            onItemDelimitation(part) {
                nItemDelims += 1;
                return super.onItemDelimitation(part);
            }
            onSequenceDelimitation(part) {
                nSeqDelims += 1;
                return super.onSequenceDelimitation(part);
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow1, testFlow2), () => {
            assert.equal(nItemDelims, 1);
            assert.equal(nSeqDelims, 1);
        });
    });
});

describe("The InSequence support", function () {
    it("should keep track of sequence depth", function () {
        let expectedDepths = [0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0];

        let check = function (depth, inSequence) {
            assert.equal(depth, expectedDepths.shift());
            if (depth > 0) assert(inSequence); else assert(!inSequence);
        };

        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.EnergyWindowInformationSequence), base.item(), data.studyDate(), base.itemDelimitation(), base.item(), // sequence
            data.sequence(Tag.EnergyWindowRangeSequence, 24), base.item(16), data.studyDate(), // nested sequence (determinate length)
            base.itemDelimitation(), base.sequenceDelimitation(),
            data.patientNameJohnDoe()); // attribute

        let testFlow = create(new class extends GuaranteedValueEvent(InSequence(GuaranteedDelimitationEvents(InFragments(DeferToPartFlow)))) {
            onPart(part) {
                check(this.sequenceDepth, this.inSequence);
                return [part];
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {});
    });
});

describe("DICOM flows with tag path tracking", function () {
    it("should update the tag path through attributes, sequences and fragments", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), // FMI
            data.studyDate(),
            data.sequence(Tag.EnergyWindowInformationSequence), base.item(), data.studyDate(), base.itemDelimitation(), base.item(), // sequence
            data.sequence(Tag.EnergyWindowRangeSequence, 24), base.item(16), data.studyDate(), // nested sequence (determinate length)
            base.itemDelimitation(), base.sequenceDelimitation(),
            data.patientNameJohnDoe(), // attribute
            data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        let expectedPaths = [
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
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenItem(Tag.EnergyWindowRangeSequence, 1).thenTag(Tag.StudyDate), // Study date header
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenItem(Tag.EnergyWindowRangeSequence, 1).thenTag(Tag.StudyDate), // Study date value
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenItemEnd(Tag.EnergyWindowRangeSequence, 1), //  item end (inserted)
            TagPath.fromItem(Tag.EnergyWindowInformationSequence, 2).thenSequenceEnd(Tag.EnergyWindowRangeSequence), // sequence end (inserted)
            TagPath.fromItemEnd(Tag.EnergyWindowInformationSequence, 2), // item end
            TagPath.fromSequenceEnd(Tag.EnergyWindowInformationSequence), // sequence end
            TagPath.fromTag(Tag.PatientName), // Patient name header
            TagPath.fromTag(Tag.PatientName), // Patient name value
            TagPath.fromTag(Tag.PixelData), // fragments start
            TagPath.fromTag(Tag.PixelData), // item start
            TagPath.fromTag(Tag.PixelData), // fragment data
            TagPath.fromTag(Tag.PixelData) // fragments end
        ];

        let check = function (tagPath) {
            console.log(tagPath, expectedPaths[0], tagPath.isEqualTo(expectedPaths[0]));
            assert(tagPath.isEqualTo(expectedPaths.shift()));
        };

        let testFlow = create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(DeferToPartFlow)))) {
            onPart(part) {
                check(this.tagPath);
                return [part];
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
        });
    });

    it("should support using tracking more than once within a flow", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.patientNameJohnDoe());

        let createTestFlow = function () {
            return create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow)))) {});
        };

        return util.testParts(bytes, pipe(parseFlow(), createTestFlow(), createTestFlow()), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(1, 16)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should support sequences and items with explicit length", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(),
            data.sequence(Tag.DigitalSignaturesSequence, 680),
            base.item(672),
            data.element(Tag.MACIDNumber, Buffer.from([1, 1])),
            data.element(Tag.DigitalSignatureUID, Buffer.from(new Array(54).fill("1"))),
            data.element(Tag.CertificateType, Buffer.from(new Array(14).fill("A"))),
            data.element(Tag.CertificateOfSigner, Buffer.from(new Array(426).fill(0))),
            data.element(Tag.Signature, Buffer.from(new Array(128).fill(0))));

        let expectedPaths = [
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
            TagPath.fromSequenceEnd(Tag.DigitalSignaturesSequence) // sequence end (inserted)
        ];

        let check = function (tagPath) {
            assert(tagPath.isEqualTo(expectedPaths.shift()));
        };

        let testFlow = create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow)))) {
            onPart(part) {
                check(this.tagPath);
                return [part];
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
        });
    });

    it("should handle elements, sequences and items of zero length", function () {
        let bytes = base.concatv(Buffer.from([8, 0, 32, 0, 68, 65, 0, 0]), data.patientNameJohnDoe(),
            data.sequence(Tag.MACParametersSequence, 0),
            data.sequence(Tag.WaveformSequence),
            base.sequenceDelimitation(),
            data.sequence(Tag.DigitalSignaturesSequence, 680),
            base.item(0),
            base.item(),
            base.itemDelimitation(),
            base.item(10),
            data.element(Tag.MACIDNumber, Buffer.from([1, 1])));

        let expectedPaths = [
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
            TagPath.fromItemEnd(Tag.DigitalSignaturesSequence, 3), // item end (inserted),
            TagPath.fromSequenceEnd(Tag.DigitalSignaturesSequence) // sequence end (inserted),
        ];

        let check = function (tagPath) {
            assert(tagPath.isEqualTo(expectedPaths.shift()));
        };

        let testFlow = create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow)))) {
            onPart(part) {
                check(this.tagPath);
                return [part];
            }
        });

        return util.testParts(bytes, pipe(parseFlow(), testFlow), () => {
        });
    });

    it("should track an entire file without exception", function () {
        let source = fs.createReadStream("images/example-el.dcm");

        let testFlow = create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(IdentityFlow)))) {});

        return util.streamPromise(source, pipe(parseFlow(), testFlow), util.arraySink(() => {}));
    });
});

