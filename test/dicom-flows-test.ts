import assert from "assert";
import pipe from "multipipe";
import {
    concat, concatv, emptyBuffer, groupNumber, indeterminateLength, intToBytesLE, isFileMetaInformation, item,
    itemDelimitation, padToEvenLength, sequenceDelimitation, shortToBytesLE, tagToBytesLE,
} from "../src/base";
import {
    blacklistFilter, deflateDatasetFlow, fmiDiscardFilter, fmiGroupLengthFlow, groupLengthDiscardFilter, headerFilter,
    stopTagFlow, tagFilter, toBytesFlow, toIndeterminateLengthSequences, toUtf8Flow,
    validateContextFlow, ValidationContext, whitelistFilter,
} from "../src/dicom-flows";
import {prependFlow} from "../src/flows";
import {modifyFlow, TagModification} from "../src/modify-flow";
import {parseFlow} from "../src/parse-flow";
import {MetaPart} from "../src/parts";
import {Tag} from "../src/tag";
import {TagPath} from "../src/tag-path";
import {TagTree} from "../src/tag-tree";
import {UID} from "../src/uid";
import {VR} from "../src/vr";
import * as data from "./test-data";
import * as util from "./test-util";

describe("The stop tag flow", () => {
    it("should stop reading data when a stop tag is reached", () => {
        const bytes = concat(data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), stopTagFlow(Tag.PatientName)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should stop reading data when a tag number is higher than the stop tag", () => {
        const bytes = concat(data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), stopTagFlow(Tag.StudyDate + 1)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should apply stop tag correctly also when preceded by sequence", () => {
        const bytes = concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence), item(),
            data.pixelData(10), itemDelimitation(), sequenceDelimitation(), data.patientNameJohnDoe(),
            data.pixelData(100));

        return util.testParts(bytes, pipe(parseFlow(), stopTagFlow(Tag.PatientName + 1)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence()
                .expectItem()
                .expectHeader(Tag.PixelData)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The DICOM group length discard filter", () => {
    it("should discard group length elements except 0002,0000", () => {
        const groupLength = concat(Buffer.from([8, 0, 0, 0, 85, 76, 4, 0]),
            intToBytesLE(data.studyDate().length));
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(), groupLength, data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), groupLengthDiscardFilter()), (parts) => {
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

describe("The DICOM file meta information discard filter", () => {
    it("should discard file meta informaton", () => {
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(), data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), fmiDiscardFilter()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The tag filter", () => {
    it("should filter elements in sequences", () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence), item(), data.studyDate(),
            data.patientNameJohnDoe(), itemDelimitation(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter((tagPath) => tagPath.tag() !== Tag.PatientName)),
            (parts) => {
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

    it("should filter elements not matching the condition", () => {
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()),
            data.fmiVersion(), data.transferSyntaxUID(), data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter((tagPath) => groupNumber(tagPath.tag()) >= 8,
            () => false)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should filter elements matching the condition", () => {
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()),
            data.fmiVersion(), data.transferSyntaxUID(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), tagFilter((tagPath) =>
            !isFileMetaInformation(tagPath.tag()), () => false)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });
});

describe("The whitelist filter", () => {
    it("should block all elements not on the white list", () => {
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.transferSyntaxUID()),
            data.transferSyntaxUID(), data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromTag(Tag.StudyDate)],
            () => false)), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should only apply to elements in the root dataset when filter points to root dataset", () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence), item(), data.patientNameJohnDoe(),
            data.studyDate(), itemDelimitation(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromTag(Tag.StudyDate)])), (parts) => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should also work on fragments", () => {
        const bytes = concatv(data.pixeDataFragments(), item(4), Buffer.from([1, 2, 3, 4]),
            item(4), Buffer.from([5, 6, 7, 8]), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([])), (parts) => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should preserve sequences and items in nested structures when using wildcards", () => {
        const bytes = concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), item(),
            data.patientNameJohnDoe(), data.studyDate(), itemDelimitation(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromAnyItem(Tag.DerivationCodeSequence)
            .thenTag(Tag.StudyDate)])), (parts) => {
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

    it("should preserve sequences and items in nested structures when using item indices", () => {
        const bytes = concatv(data.patientNameJohnDoe(), data.sequence(Tag.DerivationCodeSequence), item(),
            data.patientNameJohnDoe(), itemDelimitation(), item(), data.studyDate(), itemDelimitation(),
            sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), whitelistFilter([TagTree.fromItem(Tag.DerivationCodeSequence, 2)
            .thenTag(Tag.StudyDate)])), (parts) => {
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

describe("The blacklist filter", () => {
    it("should block the entire sequence when a sequence tag is on the black list", () => {
        const bytes = concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), item(), data.patientNameJohnDoe(),
            data.sequence(Tag.AbstractPriorCodeSequence), item(), data.patientNameJohnDoe(),
            itemDelimitation(), sequenceDelimitation(), itemDelimitation(), sequenceDelimitation(),
            data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(),
            blacklistFilter([TagTree.fromAnyItem(Tag.DerivationCodeSequence)])), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should block a single item inside a sequence", () => {
        const bytes = concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), item(), data.patientNameJohnDoe(), itemDelimitation(),
            item(), data.studyDate(), itemDelimitation(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromTag(Tag.StudyDate),
            TagTree.fromItem(Tag.DerivationCodeSequence, 1)])), (parts) => {
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

    it("should block an element in an item in a sequence", () => {
        const bytes = concatv(data.studyDate(),
            data.sequence(Tag.DerivationCodeSequence), item(), data.patientNameJohnDoe(), itemDelimitation(),
            item(), data.studyDate(), itemDelimitation(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), blacklistFilter([TagTree.fromItem(Tag.DerivationCodeSequence, 1)
            .thenTag(Tag.StudyDate)])), (parts) => {
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

describe("The header part filter", () => {
    it("should discard elements based on its header part", () => {
        const bytes = concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence), item(),
            data.patientNameJohnDoe(), itemDelimitation(), item(), data.studyDate(), itemDelimitation(),
            sequenceDelimitation(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), headerFilter((header) => header.vr === VR.PN)), (parts) => {
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

describe("The FMI group length flow", () => {
    it("should calculate and emit the correct group length attribute", () => {
        const correctLength = data.transferSyntaxUID().length;
        const bytes = concatv(data.preamble, data.fmiGroupLength(data.fmiVersion(), data.transferSyntaxUID()),
            data.fmiVersion(), data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(
            parseFlow(),
            blacklistFilter([TagTree.fromTag(Tag.FileMetaInformationVersion)]),
            fmiGroupLengthFlow()), (parts) => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should work also in flows with file meta information only", () => {
        const correctLength = data.transferSyntaxUID().length;
        const bytes = concatv(data.preamble, data.transferSyntaxUID()); // missing file meta information g. length

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), (parts) => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should work in flows without preamble", () => {
        const correctLength = data.transferSyntaxUID().length;
        const bytes = concatv(data.transferSyntaxUID(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should not emit anything in empty flows", () => {
        const bytes = emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), (parts) => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });

    it("should not emit a group length attribute when there is no FMI", () => {
        const bytes = concatv(data.preamble, data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), (parts) => {
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should keep a zero length group length attribute", () => {
        const bytes = concatv(data.fmiGroupLength(emptyBuffer), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), fmiGroupLengthFlow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(Buffer.from([0, 0, 0, 0]))
                .expectHeader(Tag.PatientName)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

    it("should ignore DICOM parts of unknown type", () => {
        class SomePart extends MetaPart {
        }

        const correctLength = data.transferSyntaxUID().length;
        const bytes = concatv(data.preamble, data.transferSyntaxUID()); // missing file meta information g. length

        return util.testParts(bytes, pipe(parseFlow(), prependFlow(new SomePart(), true), fmiGroupLengthFlow()),
            (parts) => {
            assert(parts.shift() instanceof SomePart);
            util.partProbe(parts)
                .expectPreamble()
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk(intToBytesLE(correctLength))
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDicomComplete();
        });
    });

});

describe("The utf8 flow", () => {
    it("should transform a japanese patient name encoded with multiple character sets to valid utf8", () => {
        const specificCharacterSet = concatv(tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            shortToBytesLE(0x0010), padToEvenLength(Buffer.from("\\ISO 2022 IR 149"), VR.CS));
        const patientName = concatv(tagToBytesLE(0x00100010), Buffer.from("PN"), shortToBytesLE(0x002C),
            padToEvenLength(Buffer.from([
                0x48, 0x6F, 0x6E, 0x67, 0x5E, 0x47, 0x69, 0x6C, 0x64, 0x6F, 0x6E, 0x67, 0x3D, 0x1B, 0x24, 0x29, 0x43,
                0xFB, 0xF3, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xD1, 0xCE, 0xD4, 0xD7, 0x3D, 0x1B, 0x24, 0x29, 0x43, 0xC8,
                0xAB, 0x5E, 0x1B, 0x24, 0x29, 0x43, 0xB1, 0xE6, 0xB5, 0xBF]), VR.PN));

        const bytes = concat(specificCharacterSet, patientName);

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk(Buffer.from("Hong^Gildong=洪^吉洞=홍^길동"))
                .expectDicomComplete();
        });
    });

    it("should set specific character set to ISO_IR 192 (UTF-8)", () => {
        const bytes = concatv(tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            shortToBytesLE(0x0010), padToEvenLength(Buffer.from("\\ISO 2022 IR 149"), VR.CS));

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk(Buffer.from("ISO_IR 192"))
                .expectDicomComplete();
        });
    });

    it("should transform data without the specific character set attribute, decoding using the default character set",
        () => {
        const bytes = data.patientNameJohnDoe();

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk(Buffer.from("ISO_IR 192"))
                .expectHeader(Tag.PatientName)
                .expectValueChunk(data.patientNameJohnDoe().slice(8))
                .expectDicomComplete();
        });
    });

    it("should transform data contained in sequences", () => {
        const specificCharacterSet = concatv(tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            shortToBytesLE(0x000A), padToEvenLength(Buffer.from("ISO_IR 13"), VR.CS));
        const patientName = concatv(tagToBytesLE(0x00100010), Buffer.from("PN"), shortToBytesLE(0x0008),
            padToEvenLength(Buffer.from([0xD4, 0xCF, 0xC0, 0xDE, 0x5E, 0xC0, 0xDB, 0xB3]), VR.PN));

        const bytes = concatv(specificCharacterSet, data.sequence(Tag.DerivationCodeSequence), item(),
            patientName, itemDelimitation(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
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

    it("should not transform data with VR that doesn't support non-default encodings", () => {
        const specificCharacterSet = concatv(tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            shortToBytesLE(0x0010), padToEvenLength(Buffer.from("\\ISO 2022 IR 149"), VR.CS));
        const patientNameCS = concatv(tagToBytesLE(0x00100010), Buffer.from("CS"),
            shortToBytesLE(0x0004), padToEvenLength(Buffer.from([0xD4, 0xCF, 0xC0, 0xDE]), VR.PN));

        const bytes = concat(specificCharacterSet, patientNameCS);

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectValueChunk(Buffer.from([0xD4, 0xCF, 0xC0, 0xDE]))
                .expectDicomComplete();
        });
    });

    it("should not change a file already encoded with ISO_IR 192 (UTF-8)", () => {
        const specificCharacterSet = concatv(tagToBytesLE(Tag.SpecificCharacterSet), Buffer.from("CS"),
            shortToBytesLE(0x000A), Buffer.from("ISO_IR 192"));
        const patientName = concatv(tagToBytesLE(Tag.PatientName), Buffer.from("PN"),
            shortToBytesLE(0x000C), Buffer.from("ABC^ÅÖ^ﾔ"));
        const bytes = concat(specificCharacterSet, patientName);

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
            const newBytes = parts.map((p) => p.bytes).reduce((b1, b2) => concat(b1, b2), emptyBuffer);
            assert.deepStrictEqual(newBytes, bytes);
        });
    });

    it("should leave and empty element empty", () => {
        const bytes = data.emptyPatientName();

        return util.testParts(bytes, pipe(parseFlow(), toUtf8Flow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.SpecificCharacterSet)
                .expectValueChunk()
                .expectHeader(Tag.PatientName)
                .expectDicomComplete();
        });
    });
});

describe("The sequence length filter", () => {
    it("should replace determinate length sequences and items with indeterminate, and insert delimitations", () => {
        const bytes =
            concatv(data.sequence(Tag.DerivationCodeSequence, 56), item(16), data.studyDate(),
                item(), data.studyDate(), itemDelimitation(),
                data.sequence(Tag.AbstractPriorCodeSequence), item(), data.studyDate(), itemDelimitation(),
                item(16), data.studyDate(), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation() // inserted
                .expectItem(2)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation() // inserted
                .expectSequence(Tag.AbstractPriorCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
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

    it("should handle sequences that end with an item delimitation", () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence, 32), item(), data.studyDate(), itemDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should not remove length from items in fragments", () => {
        const bytes = concatv(
            data.pixeDataFragments(), item(4), Buffer.from([1, 2, 3, 4]), sequenceDelimitation(),
            data.sequence(Tag.DerivationCodeSequence, 40), item(32),
            data.pixeDataFragments(), item(4), Buffer.from([1, 2, 3, 4]), sequenceDelimitation());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), (parts) => {
            util.partProbe(parts)
                .expectFragments()
                .expectItem(1, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
                .expectFragments()
                .expectItem(1, 4)
                .expectValueChunk()
                .expectFragmentsDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it("should work in datasets with nested sequences", () => {
        const bytes = concatv(data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 60), item(52),
            data.studyDate(), data.sequence(Tag.DerivationCodeSequence, 24), item(16), data.studyDate(),
            data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
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

    it("should handle empty sequences and items", () => {
        const bytes = concatv(
            data.sequence(Tag.DerivationCodeSequence, 52), item(16), data.studyDate(),
            item(0), item(12), data.sequence(Tag.DerivationCodeSequence, 0));

        return util.testParts(bytes, pipe(parseFlow(), toIndeterminateLengthSequences()), (parts) => {
            util.partProbe(parts)
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectItem(1, indeterminateLength)
                .expectHeader(Tag.StudyDate)
                .expectValueChunk()
                .expectItemDelimitation()
                .expectItem(2, indeterminateLength)
                .expectItemDelimitation()
                .expectItem(3, indeterminateLength)
                .expectSequence(Tag.DerivationCodeSequence, indeterminateLength)
                .expectSequenceDelimitation()
                .expectItemDelimitation()
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });
});

describe("The context validation flow", () => {
    it("should accept DICOM data that corresponds to the given contexts", () => {
        const contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        const bytes = concatv(data.preamble,
            data.fmiGroupLength(data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(),
            data.transferSyntaxUID()), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(),
            data.transferSyntaxUID());

        return util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), (parts) => {
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
                .expectDicomComplete();
        });
    });

    it("should accept SOP Class UID specified in either file meta information or in the dataset", () => {
        const contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        const bytes = concatv(data.preamble,
            data.fmiGroupLength(data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID(), data.sopClassUID());

        return util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)), (parts) => {
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

    it("should not accept DICOM data that does not correspond to the given contexts", () => {
        const contexts = [new ValidationContext(UID.CTImageStorage, "1.2.840.10008.1.2.2")];
        const bytes = concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(),
            data.transferSyntaxUID()), data.fmiVersion(), data.mediaStorageSOPClassUID(),
            data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)),
            () => {
                // do nothing
            }));
    });

    it("should not accept a file with no SOPCLassUID if a context is given", () => {
        const contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        const bytes = concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID()),
            data.fmiVersion(), data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)),
            () => {
                // do nothing
            }));
    });

    it("should not accept a file with no TransferSyntaxUID if a context is given", () => {
        const contexts = [new ValidationContext(UID.CTImageStorage, UID.ExplicitVRLittleEndian)];
        const bytes = concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID()),
            data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)),
            () => {
                // do nothing
            }));
    });

    it("should not accept DICOM data if no valid contexts are given", () => {
        const contexts: ValidationContext[] = [];
        const bytes = concatv(data.preamble,
            data.fmiGroupLength(data.fmiVersion(), data.mediaStorageSOPClassUID(), data.mediaStorageSOPInstanceUID(),
            data.transferSyntaxUID()), data.fmiVersion(), data.mediaStorageSOPClassUID(),
            data.mediaStorageSOPInstanceUID(), data.transferSyntaxUID());

        return util.expectDicomError(() => util.testParts(bytes, pipe(parseFlow(), validateContextFlow(contexts)),
            () => {
                // do nothing
            }));
    });
});

describe("The deflate flow", () => {
    it("should recreate the dicom parts of a dataset which has been deflated and inflated again", () => {
        const bytes = concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromTag(Tag.FileMetaInformationGroupLength),
                () => data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)).slice(8)),
            TagModification.equals(TagPath.fromTag(Tag.TransferSyntaxUID),
                () => Buffer.from(UID.DeflatedExplicitVRLittleEndian)),
        ]), deflateDatasetFlow(), toBytesFlow(), parseFlow()), (parts) => {
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

    it("should not deflate meta information", () => {
        const bytes = concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), modifyFlow([
            TagModification.equals(TagPath.fromTag(Tag.FileMetaInformationGroupLength),
                () => data.fmiGroupLength(data.transferSyntaxUID(UID.DeflatedExplicitVRLittleEndian)).slice(8)),
            TagModification.equals(TagPath.fromTag(Tag.TransferSyntaxUID),
                () => Buffer.from(UID.DeflatedExplicitVRLittleEndian)),
        ]), deflateDatasetFlow()), (parts) => {
            util.partProbe(parts)
                .expectHeader(Tag.FileMetaInformationGroupLength)
                .expectValueChunk()
                .expectHeader(Tag.TransferSyntaxUID)
                .expectValueChunk()
                .expectDeflatedChunk();
        });
    });

    it("should not deflate data with non-deflated transfer syntax", () => {
        const bytes = concatv(data.fmiGroupLength(data.transferSyntaxUID()), data.transferSyntaxUID(),
            data.studyDate(), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), deflateDatasetFlow()), (parts) => {
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

    it("should not ouput bytes when the stream is empty", () => {
        const bytes = emptyBuffer;

        return util.testParts(bytes, pipe(parseFlow(), deflateDatasetFlow()), (parts) => {
            util.partProbe(parts)
                .expectDicomComplete();
        });
    });
});
