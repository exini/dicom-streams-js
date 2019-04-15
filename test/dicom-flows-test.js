const assert = require("assert");
const pipe = require("multipipe");
const base = require("../src/base");
const Tag = require("../src/tag");
const VR = require("../src/vr");
const UID = require("../src/uid");
const {MetaPart} = require("../src/parts");
const {TagPath} = require("../src/tag-path");
const {TagTree} = require("../src/tag-tree");
const {parseFlow} = require("../src/dicom-parser");
const {prependFlow} = require("../src/flows");
const {TagModification, modifyFlow} = require("../src/modify-flow");
const {
    groupLengthDiscardFilter, fmiDiscardFilter, blacklistFilter, whitelistFilter, tagFilter, headerFilter,
    fmiGroupLengthFlow, toIndeterminateLengthSequences, ValidationContext, validateContextFlow, deflateDatasetFlow,
    toUtf8Flow, toBytesFlow
} = require("../src/dicom-flows");
const data = require("./test-data");
const util = require("./test-util");

describe("The DICOM group length discard filter", function () {
    it("should discard group length elements except 0002,0000", function () {
        let groupLength = base.concat(Buffer.from([8, 0, 0, 0, 85, 76, 4, 0]), base.intToBytesLE(data.studyDate().size));
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), groupLength, data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), groupLengthDiscardFilter()), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The DICOM file meta information discard filter", function () {
    it("should discard file meta informaton", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), fmiDiscardFilter()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The tag filter", function () {
    it("should filter elements in sequences", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.studyDate(), data.patientNameJohnDoe(),
            base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter(tagPath => tagPath.tag() !== Tag.PatientName)), parts => {
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

    it("should filter elements not matching the condition", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()),
            data.fmiVersion(), data.transferSyntaxUID(), data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter(tagPath => base.groupNumber(tagPath.tag()) >= 8, () => false)), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should filter elements matching the condition", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()), data.fmiVersion(),
            data.transferSyntaxUID(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter(tagPath => !base.isFileMetaInformation(tagPath.tag()), () => false)), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The whitelist filter", function () {
    it("should block all elements not on the white list", function () {
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromTag(Tag.StudyDate)], () => false)), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should only apply to elements in the root dataset when filter points to root dataset", function () {
        let bytes = base.concatv(data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), data.studyDate(),
            base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should also work on fragments", function () {
        let bytes = base.concatv(data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]),
            base.item(4), Buffer.from([5, 6, 7, 8]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([])), parts => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should preserve sequences and items in nested structures when using wildcards", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(),
            data.patientNameJohnDoe(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.StudyDate)])), parts => {
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

    it("should preserve sequences and items in nested structures when using item indices", function () {
        let bytes = base.concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), base.item(),
            data.patientNameJohnDoe(), base.itemDelimitation(), base.item(), data.studyDate(), base.itemDelimitation(),
            base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromItem(Tag.DerivationCodeSequence, 2).thenTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });
});

describe("The blacklist filter", function () {
    it("should block the entire sequence when a sequence tag is on the black list", function () {
        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(),
            data.sequence(Tag.AbstractPriorCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(), base.sequenceDelimitation(),
            base.itemDelimitation(), base.sequenceDelimitation(),
            data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromAnyItem(Tag.DerivationCodeSequence)])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should block a single item inside a sequence", function () {
        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(),
            base.item(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromTag(Tag.StudyDate), TagTree.fromItem(Tag.DerivationCodeSequence, 1)])), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should block an element in an item in a sequence", function () {
        let bytes = base.concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), base.item(), data.patientNameJohnDoe(), base.itemDelimitation(),
            base.item(), data.studyDate(), base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.StudyDate)])), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });
});

describe("The header part filter", function () {
    it("should discard elements based on its header part", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence), base.item(),
            data.patientNameJohnDoe(), base.itemDelimitation(), base.item(), data.studyDate(), base.itemDelimitation(),
            base.sequenceDelimitation(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), headerFilter(header => header.vr === VR.PN)), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The FMI group length flow", function () {
    it("should calculate and emit the correct group length attribute", function () {
        let correctLength = data.transferSyntaxUID().length;
        let bytes = base.concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()),
            data.fmiVersion(), data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(
            parseFlow(),
            blacklistFilter([TagTree.fromTag(Tag.FileMetaInformationVersion)]),
            fmiGroupLengthFlow()), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(base.intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should work also in flows with file meta information only", function () {
        let correctLength = data.transferSyntaxUID().length;
        let bytes = base.concatv(data.preamble, data.transferSyntaxUID()); // missing file meta information group length

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(base.intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should work in flows without preamble", function () {
        let correctLength = data.transferSyntaxUID().length;
        let bytes = base.concatv(data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(base.intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should not emit anything in empty flows", function () {
        let bytes = base.emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), parts => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should not emit a group length attribute when there is no FMI", function () {
        let bytes = base.concatv(data.preamble, data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should keep a zero length group length attribute", function () {
        let bytes = base.concatv(data.fmiGroupLength(base.emptyBuffer), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(Buffer.from([0, 0, 0, 0]))
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should ignore DICOM parts of unknown type", function () {
        class SomePart extends MetaPart {
        }

        let correctLength = data.transferSyntaxUID().length;
        let bytes = base.concatv(data.preamble, data.transferSyntaxUID()); // missing file meta information group length

        return util.testParts(bytes, pipe(parseFlow(), prependFlow(new SomePart(), true), fmiGroupLengthFlow()), parts => {
            assert(parts.shift() instanceof SomePart);
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(base.intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

});

describe("The utf8 flow", function () {
    it("should transform a japanese patient name encoded with multiple character sets to valid utf8", function () {
        let specificCharacterSet = base.concatv(base.tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            base.shortToBytesLE(0x0010), base.padToEvenLength(Buffer.from("\\ISO 2022 IR 149"), VR.CS));
        let patientName = base.concatv(base.tagToBytesLE(0x00100010), Buffer.from("PN"), base.shortToBytesLE(0x002C),
            base.padToEvenLength(Buffer.from([
                0x48, 0x6F, 0x6E, 0x67, 0x5E, 0x47, 0x69, 0x6C, 0x64, 0x6F, 0x6E, 0x67, 0x3D, 0x1B, 0x24, 0x29, 0x43,
                0xFB, 0xF3, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xD1, 0xCE, 0xD4, 0xD7, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xC8,
                0xAB, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xB1, 0xE6, 0xB5, 0xBF]), VR.PN));

        let bytes = base.concat(specificCharacterSet, patientName);

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk(Buffer.from("Hong^Gildong=洪^吉洞=홍^길동"))
                .expectDicomComplete();
        });
    });

    it("should set specific character set to ISO_IR 192 (UTF-8)", function () {
        let bytes = base.concatv(base.tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            base.shortToBytesLE(0x0010), base.padToEvenLength(Buffer.from("\\ISO 2022 IR 149"), VR.CS));

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk(Buffer.from("ISO_IR 192"))
                .expectDicomComplete();
        });
    });

    it("should transform data without the specific character set attribute, decoding using the default character set", function () {
        let bytes = data.patientNameJohnDoe();

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk(Buffer.from("ISO_IR 192"))
                .expectHeader(Tag.PatientName)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectDicomComplete()
        });
    });

    it("should transform data contained in sequences", function () {
        let specificCharacterSet = base.concatv(base.tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            base.shortToBytesLE(0x000A), base.padToEvenLength(Buffer.from("ISO_IR 13"), VR.CS));
        let patientName = base.concatv(base.tagToBytesLE(0x00100010), Buffer.from("PN"), base.shortToBytesLE(0x0008), base.padToEvenLength(Buffer.from([0xD4, 0xCF, 0xC0, 0xDE, 0x5E, 0xC0, 0xDB, 0xB3]), VR.PN));

        let bytes = base.concatv(specificCharacterSet, data.sequence(Tag.DerivationCodeSequence), base.item(), patientName, base.itemDelimitation(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence)
                .expectItem(1)
                .expectHeader(Tag.PatientName)
                .expectValueChunk(Buffer.from("ﾔﾏﾀﾞ^ﾀﾛｳ"))
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should not transform data with VR that doesn't support non-default encodings", function () {
        let specificCharacterSet = base.concatv(base.tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            base.shortToBytesLE(0x0010), base.padToEvenLength(Buffer.from("\\ISO 2022 IR 149"), VR.CS));
        let patientNameCS = base.concatv(base.tagToBytesLE(0x00100010), Buffer.from("CS"), base.shortToBytesLE(0x0004), base.padToEvenLength(Buffer.from([0xD4, 0xCF, 0xC0, 0xDE]), VR.PN));

        let bytes = base.concat(specificCharacterSet, patientNameCS);

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk(Buffer.from([0xD4, 0xCF, 0xC0, 0xDE]))
                .expectDicomComplete();
        });
    });

    it("should not change a file already encoded with ISO_IR 192 (UTF-8)", function () {
        let specificCharacterSet = base.concatv(base.tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"), base.shortToBytesLE(0x000A), Buffer.from("ISO_IR 192"));
        let patientName = base.concatv(base.tagToBytesLE(Tag.PatientName), Buffer.from("PN"), base.shortToBytesLE(0x000C), Buffer.from("ABC^ÅÖ^ﾔ"));
        let bytes = base.concat(specificCharacterSet, patientName);

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            let newBytes = parts.map(p => p.bytes).reduce((b1, b2) => base.concat(b1, b2), base.emptyBuffer);
            assert.deepStrictEqual(newBytes, bytes);
        });
    });

    it("should leave and empty element empty", function () {
        let bytes = data.emptyPatientName();

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectDicomComplete();
        });
    });
});

describe("The sequence length filter", function () {
    it("should replace determinate length sequences and items with indeterminate, and insert delimitations", function () {
        let bytes =
            base.concatv(data.sequence(Tag.DerivationCodeSequence, 56), base.item(16), data.studyDate(), base.item(), data.studyDate(), base.itemDelimitation(),
                data.sequence(Tag.AbstractPriorCodeSequence), base.item(), data.studyDate(), base.itemDelimitation(), base.item(16), data.studyDate(), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation() // inserted
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation() // inserted
                .expectSequence(Tag.AbstractPriorCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation() // inserted
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should handle sequences that end with an item delimitation", function () {
        let bytes = base.concatv(
            data.sequence(Tag.DerivationCodeSequence, 32), base.item(), data.studyDate(), base.itemDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should not remove length from items in fragments", function () {
        let bytes = base.concatv(
            data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation(),
            data.sequence(Tag.DerivationCodeSequence, 40), base.item(32),
            data.pixeDataFragments(), base.item(4), Buffer.from([1, 2, 3, 4]), base.sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
                .expectFragments()
                .expectItem(1, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectFragments()
                .expectItem(1, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should work in datasets with nested sequences", function () {
        let bytes = base.concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 60), base.item(52), data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence, 24), base.item(16), data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
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

    it("should handle empty sequences and items", function () {
        let bytes = base.concatv(
            data.sequence(Tag.DerivationCodeSequence, 52), base.item(16), data.studyDate(),
            base.item(0), base.item(12), data.sequence(Tag.DerivationCodeSequence, 0));

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), parts => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectItem(1, -1)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2, -1)
                .expectItemDelimitation()
                .expectItem(3, -1)
                .expectSequence(Tag.DerivationCodeSequence, -1)
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });
});

describe("The context validation flow", function () {
    it("should accept DICOM data that corresponds to the given contexts", function () {
        let contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        let bytes = base.concatv(data.preamble,
            data.fmiGroupLength(data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.MediaStorageSOPClassUID)
                .expectValueChunk()
                .expectHeader(Tag.MediaStorageSOPInstanceUID)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete()
        });
    });

    it("should accept SOP Class UID specified in either file meta information or in the dataset", function () {
        let contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        let bytes = base.concatv(data.preamble,
            data.fmiGroupLength(data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID(), data.sopClassUID());

        return util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), parts => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.MediaStorageSOPInstanceUID)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.SOPClassUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should not accept DICOM data that does not correspond to the given contexts", function () {
        let contexts = [new ValidationContext(UID.CTImageStorage, "1.2.840.10008.1.2.2")];
        let bytes = base.concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), parts => {}));
    });

    it("should not accept a file with no SOPCLassUID if a context is given", function () {
        let contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        let bytes = base.concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.fmiVersion(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), parts => {}));
    });

    it("should not accept a file with no TransferSyntaxUID if a context is given", function () {
        let contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        let bytes = base.concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID()),
            data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), parts => {}));
    });

    it("should not accept DICOM data if no valid contexts are given", function () {
        let contexts = [];
        let bytes = base.concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), parts => {}));
    });
});

describe("The deflate flow", function () {
    it("should recreate the dicom parts of a dataset which has been deflated and inflated again", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromTag(Tag.FileMetaInformationGroupLength), () => data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)).slice(8)),
            TagModification.equals(TagPath.fromTag(Tag.TransferSyntaxUID), () => Buffer.from(UID.DeflatedExplicitVRLittleEndian))
        ]), deflateDatasetFlow(), toBytesFlow(), parseFlow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should not deflate meta information", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromTag(Tag.FileMetaInformationGroupLength), () => data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)).slice(8)),
            TagModification.equals(TagPath.fromTag(Tag.TransferSyntaxUID), () => Buffer.from(UID.DeflatedExplicitVRLittleEndian))
        ]), deflateDatasetFlow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDeflatedChunk();
        });
    });

    it("should not deflate data with non-deflated transfer syntax", function () {
        let bytes = base.concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(), data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), deflateDatasetFlow()), parts => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });


    it("should not ouput bytes when the stream is empty", function () {
        let bytes = base.emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), deflateDatasetFlow()), parts => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });
});
