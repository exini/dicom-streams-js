const {Transform} = require("readable-stream");
const zlib = require("zlib");
const pipe = require("multipipe");
const base = require("./base");
const VR = require("./vr");
const UID = require("./uid");
const {TagPath} = require("./tag-path");
const {Detour} = require("./detour");
const {
    PreamblePart, HeaderPart, ValueChunk, SequencePart, SequenceDelimitationPart, ItemPart, ItemDelimitationPart,
    DeflatedChunk, ElementsPart
} = require("./parts");
const {emptyTagPath} = require("./tag-path");
const {
    IdentityFlow, DeferToPartFlow, InFragments, GuaranteedValueEvent, GuaranteedDelimitationEvents, TagPathTracking,
    GroupLengthWarnings, EndEvent, create
} = require("./dicom-flow");
const {collectFlow, collectFromTagPathsFlow} = require("./collect-flow");
const {modifyFlow, TagInsertion} = require("./modify-flow");
const {CharacterSets} = require("./character-sets");

const toBytesFlow = function () {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
            this.push(chunk.bytes);
            process.nextTick(() => callback());
        }
    });
};

const whitelistFilter = function (whitelist, defaultCondition, logGroupLengthWarnings) {
    return tagFilter(currentPath => whitelist.some(t => t.hasTrunk(currentPath) || t.isTrunkOf(currentPath)), defaultCondition, logGroupLengthWarnings);
};

const blacklistFilter = function (blacklist, defaultCondition, logGroupLengthWarnings) {
    return tagFilter(currentPath => !blacklist.some(t => t.isTrunkOf(currentPath)), defaultCondition, logGroupLengthWarnings);
};

const groupLengthDiscardFilter = function () {
    return tagFilter(tagPath => !base.isGroupLength(tagPath.tag()) || base.isFileMetaInformation(tagPath.tag()));
};

const fmiDiscardFilter = function () {
    return tagFilter(tagPath => !base.isFileMetaInformation(tagPath.tag()), () => false);
};

const tagFilter = function (keepCondition, defaultCondition, logGroupLengthWarnings) {
    let warnings = logGroupLengthWarnings === undefined ? false : logGroupLengthWarnings;
    let defCond = defaultCondition === undefined ? () => true : defaultCondition;
    return create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(GroupLengthWarnings(InFragments(DeferToPartFlow))))) {
        constructor() {
            super();
            this.silent = !warnings;
            this.keeping = false;
        }

        onPart(part) {
            this.keeping = this.tagPath === emptyTagPath ? defCond(part) : keepCondition(this.tagPath);
            return this.keeping ? [part] : [];
        }
    });
};

const headerFilter = function (keepCondition, logGroupLengthWarnings) {
    let warnings = logGroupLengthWarnings === undefined ? false : logGroupLengthWarnings;
    return create(new class extends GroupLengthWarnings(InFragments(DeferToPartFlow)) {
        constructor() {
            super();
            this.silent = !warnings;
            this.keeping = true;
        }

        onPart(part) {
            if (part instanceof HeaderPart) {
                this.keeping = keepCondition(part);
                return this.keeping ? [part] : [];
            }
            if (part instanceof ValueChunk)
                return this.keeping ? [part] : [];
            this.keeping = true;
            return [part];
        }
    });
};

class ValidationContext {
    constructor(sopClassUID, transferSyntaxUID) {
        this.sopClassUID = sopClassUID;
        this.transferSyntaxUID = transferSyntaxUID;
    }
}

const validateContextFlow = function (contexts) {
    return pipe(
        collectFromTagPathsFlow([
            TagPath.fromTag(Tag.MediaStorageSOPClassUID),
            TagPath.fromTag(Tag.TransferSyntaxUID),
            TagPath.fromTag(Tag.SOPClassUID)
        ], "validatecontext"),
        create(new class extends DeferToPartFlow {
            onPart(part) {
                if (part instanceof ElementsPart && part.label === "validatecontext") {
                    let scuid = part.elements.stringByTag(Tag.MediaStorageSOPClassUID);
                    if (scuid === undefined) scuid = part.elements.stringByTag(Tag.SOPClassUID);
                    if (scuid === undefined) scuid = "<empty>";
                    let tsuid = part.elements.stringByTag(Tag.TransferSyntaxUID);
                    if (tsuid === undefined) tsuid = "<empty>";
                    if (contexts.findIndex(c => c.sopClassUID === scuid && c.transferSyntaxUID === tsuid) >= 0)
                        return [];
                    else
                        throw Error("The presentation context [SOPClassUID = " + scuid + ", TransferSyntaxUID = " + tsuid + "] is not supported");
                }
                return [part];
            }
        })
    );
};

const fmiGroupLengthFlow = function () {
    return pipe(
        collectFlow(
            tagPath => tagPath.isRoot() && base.isFileMetaInformation(tagPath.tag()),
            tagPath => !base.isFileMetaInformation(tagPath.tag()),
            "fmigrouplength"
        ), tagFilter(
            tagPath => !base.isFileMetaInformation(tagPath.tag()),
            () => true,
            false),
        create(new class extends EndEvent(DeferToPartFlow) {
            constructor() {
                super();
                this.fmi = [];
                this.hasEmitted = false;
            }

            onEnd() {
                return this.hasEmitted ? [] : this.fmi;
            }

            onPart(part) {
                if (part instanceof ElementsPart && part.label === "fmigrouplength") {
                    let elements = part.elements;
                    if (elements.data.length > 0) {
                        let bigEndian = elements.data[0].bigEndian;
                        let explicitVR = elements.data[0].explicitVR;
                        let fmiElementsNoLength = elements.filter(e => e.tag !== Tag.FileMetaInformationGroupLength);
                        let length = fmiElementsNoLength.data.map(e => e.toBytes().length).reduce((l1, l2) => l1 + l2, 0);
                        let lengthHeader = new HeaderPart(Tag.FileMetaInformationGroupLength, VR.UL, 4, true, bigEndian, explicitVR);
                        let lengthChunk = new ValueChunk(bigEndian, base.intToBytes(length, bigEndian), true);
                        this.fmi = base.concatArrays([lengthHeader, lengthChunk], fmiElementsNoLength.toParts());
                    }
                    return [];
                }
                if (!this.hasEmitted && part.bytes.length > 0) {
                    this.hasEmitted = true;
                    return part instanceof PreamblePart
                        ? base.prependToArray(part, this.fmi)
                        : base.appendToArray(part, this.fmi);
                }
                return [part];
            }
        })
    );
};

const toIndeterminateLengthSequences = function () {
    return create(new class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {
        constructor() {
            super();
            this.indeterminateBytes = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
        }

        onSequence(part) {
            return super.onSequence(part).map(p => {
                if (p instanceof SequencePart && !p.indeterminate) {
                    return new SequencePart(
                        part.tag,
                        base.indeterminateLength,
                        part.bigEndian,
                        part.explicitVR,
                        base.concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes));
                }
                return p;
            });
        }

        onSequenceDelimitation(part) {
            let out = super.onSequenceDelimitation(part);
            if (part.bytes.length <= 0)
                out.push(new SequenceDelimitationPart(part.bigEndian, base.sequenceDelimitation(part.bigEndian)));
            return out;
        }

        onItem(part) {
            return super.onItem(part).map(p => {
                if (p instanceof ItemPart && !this.inFragments && !p.indeterminate) {
                    return new ItemPart(
                        part.index,
                        base.indeterminateLength,
                        part.bigEndian,
                        base.concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes));
                }
                return p;
            });
        }

        onItemDelimitation(part) {
            let out = super.onItemDelimitation(part);
            if (part.bytes.length <= 0)
                out.push(new ItemDelimitationPart(part.index, part.bigEndian, base.itemDelimitation(part.bigEndian)));
            return out;
        }
    });
};

const toUtf8Flow = function () {
    return pipe(
        collectFromTagPathsFlow([TagPath.fromTag(Tag.SpecificCharacterSet)], "toutf8"),
        modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.SpecificCharacterSet), () => Buffer.from("ISO_IR 192"))]),
        create(new class extends IdentityFlow {
            constructor() {
                super();
                this.characterSets = base.defaultCharacterSet;
                this.currentHeader = undefined;
                this.currentValue = base.emptyBuffer;
            }

            onHeader(part) {
                if (part.length > 0 && CharacterSets.isVrAffectedBySpecificCharacterSet(part.vr)) {
                    this.currentHeader = part;
                    this.currentValue = base.emptyBuffer;
                    return [];
                } else {
                    this.currentHeader = undefined;
                    return [part];
                }
            }

            onValueChunk(part) {
                if (this.currentHeader !== undefined) {
                    this.currentValue = base.concat(this.currentValue, part.bytes);
                    if (part.last) {
                        let newValue = Buffer.from(this.characterSets.decode(this.currentValue, this.currentHeader.vr));
                        let newLength = newValue.length;
                        return [
                            this.currentHeader.withUpdatedLength(newLength),
                            new ValueChunk(this.currentHeader.bigEndian, newValue, true)
                        ];
                    } else
                        return [];
                } else
                    return [part];
            }

            onPart(part) {
                if (part instanceof ElementsPart && part.label === "toutf8") {
                    let csNames = part.elements.stringsByTag(Tag.SpecificCharacterSet);
                    if (csNames.length > 0)
                        this.characterSets = new CharacterSets(csNames);
                    return [];
                }
                return [part];
            }
        })
    );
};

class DeflateDatasetFlow extends Detour {
    constructor() {
        super({objectMode: true});
        this.collectingTs = false;
        this.tsBytes = base.emptyBuffer;
    }

    process(part) {
        if (part instanceof HeaderPart) {
            if (part.isFmi) {
                this.collectingTs = part.tag === Tag.TransferSyntaxUID;
                this.push(part);
            } else {
                if (this.tsBytes.toString().trim() === UID.DeflatedExplicitVRLittleEndian) {
                    let toDeflatedChunk = new Transform({
                        readableObjectMode: true,
                        transform(chunk, encoding, cb) {
                            this.push(new DeflatedChunk(false, chunk));
                            process.nextTick(() => cb());
                        }
                    });
                    this.setDetourFlow(pipe(toBytesFlow(), zlib.createDeflateRaw(), toDeflatedChunk));
                    this.setDetour(true, part);
                } else
                    this.push(part);
            }
        } else if (part instanceof ValueChunk && this.collectingTs) {
            this.tsBytes = base.concat(this.tsBytes, part.bytes);
            this.push(part);
        } else
            this.push(part);
    }
}

const deflateDatasetFlow = function () {
    return new DeflateDatasetFlow();
};

module.exports = {
    toBytesFlow: toBytesFlow,
    tagFilter: tagFilter,
    whitelistFilter: whitelistFilter,
    blacklistFilter: blacklistFilter,
    headerFilter: headerFilter,
    groupLengthDiscardFilter: groupLengthDiscardFilter,
    fmiDiscardFilter: fmiDiscardFilter,
    fmiGroupLengthFlow: fmiGroupLengthFlow,
    toIndeterminateLengthSequences: toIndeterminateLengthSequences,
    toUtf8Flow: toUtf8Flow,
    ValidationContext: ValidationContext,
    validateContextFlow: validateContextFlow,
    deflateDatasetFlow: deflateDatasetFlow
};
