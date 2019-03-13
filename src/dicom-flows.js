const base = require("./base");
const {SequencePart, SequenceDelimitationPart, ItemPart, ItemDelimitationPart} = require("./parts");
const {emptyTagPath} = require("./tag-path");
const {IdentityFlow, DeferToPartFlow, InFragments, GuaranteedValueEvent, GuaranteedDelimitationEvents, TagPathTracking,
    GroupLengthWarnings, create} = require("./dicom-flow");

const whitelistFilter = function (whitelist) {
    return tagFilter(currentPath => whitelist.some(t => t.hasTrunk(currentPath) || t.isTrunkOf(currentPath)), () => false);
};

const blacklistFilter = function (blacklist) {
    return tagFilter(currentPath => !blacklist.some(t => t.isTrunkOf(currentPath)));
};

const groupLengthDiscardFilter = function() {
    return tagFilter(tagPath => !base.isGroupLength(tagPath.tag()) || base.isFileMetaInformation(tagPath.tag()));
};

const fmiDiscardFilter = function() {
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

const toIndeterminateLengthSequences = function() {
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

module.exports = {
    tagFilter: tagFilter,
    whitelistFilter: whitelistFilter,
    blacklistFilter: blacklistFilter,
    groupLengthDiscardFilter: groupLengthDiscardFilter,
    fmiDiscardFilter: fmiDiscardFilter,
    toIndeterminateLengthSequences: toIndeterminateLengthSequences
};
