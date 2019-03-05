const base = require("./base");
const {SequencePart, SequenceDelimitationPart, ItemPart, ItemDelimitationPart} = require("./parts");
const {emptyTagPath} = require("./tag-path");
const {IdentityFlow, DeferToPartFlow, GuaranteedDelimitationEvents, TagPathTracking, flow} = require("./dicom-flow");

const whitelistFilter = function (whitelist) {
    return tagFilter(() => false, currentPath => whitelist.some(t => t.hasTrunk(currentPath) || t.isTrunkOf(currentPath)))
};

const blacklistFilter = function (blacklist) {
    return tagFilter(() => true, currentPath => !blacklist.some(t => t.isTrunkOf(currentPath)))
};

const groupLengthDiscardFilter = function() {
    return tagFilter(() => true, tagPath => !base.isGroupLength(tagPath.tag()) || base.isFileMetaInformation(tagPath.tag()))
};

const fmiDiscardFilter = function() {
    return tagFilter(() => false, tagPath => !base.isFileMetaInformation(tagPath.tag()))
};

const tagFilter = function (defaultCondition, tagCondition) {
    return flow({}, {
        _keeping: { value: false },
        _update: function (part) {
            let t = this.tagPath();
            this._keeping.value = t === emptyTagPath ? defaultCondition(part) : tagCondition(t);
        },
        _emit: function (part) {
            return this._keeping.value ? [part] : [];
        },
        _updateThenEmit (part) {
            this._update(part);
            return this._emit(part);
        },
        onPart: function (part) {
            return this._updateThenEmit(part);
        }
    }, DeferToPartFlow, TagPathTracking);
};

const toIndeterminateLengthSequences = function() {
    return flow({
        onSequence: "toIndeterminateLengthSequences_onSequence",
        onSequenceDelimitation: "toIndeterminateLengthSequences_onSequenceDelimitation",
        onItem: "toIndeterminateLengthSequences_onItem",
        onItemDelimitation: "toIndeterminateLengthSequences_onItemDelimitation"
    }, {
        indeterminateBytes: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]),
        onSequence: function (part) {
            return this.toIndeterminateLengthSequences_onSequence(part).map(p => {
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
        },
        onSequenceDelimitation: function (part) {
            let out = this.toIndeterminateLengthSequences_onSequenceDelimitation(part);
            if (part.bytes.length <= 0)
                out.push(new SequenceDelimitationPart(part.bigEndian, base.sequenceDelimitation(part.bigEndian)));
            return out;
        },
        onItem: function (part) {
            return this.toIndeterminateLengthSequences_onItem(part).map(p => {
                if (p instanceof ItemPart && !this.inFragments.value && !p.indeterminate) {
                    return new ItemPart(
                        part.index,
                        base.indeterminateLength,
                        part.bigEndian,
                        base.concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes));
                }
                return p;
            });
        },
        onItemDelimitation: function (part) {
            let out = this.toIndeterminateLengthSequences_onItemDelimitation(part);
            if (part.bytes.length <= 0)
                out.push(new ItemDelimitationPart(part.index, part.bigEndian, base.itemDelimitation(part.bigEndian)));
            return out;
        }
    }, IdentityFlow, GuaranteedDelimitationEvents);
};

module.exports = {
    tagFilter: tagFilter,
    whitelistFilter: whitelistFilter,
    blacklistFilter: blacklistFilter,
    groupLengthDiscardFilter: groupLengthDiscardFilter,
    fmiDiscardFilter: fmiDiscardFilter,
    toIndeterminateLengthSequences: toIndeterminateLengthSequences
};
