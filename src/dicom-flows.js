const base = require("./base");
const parts = require("./parts");
const {IdentityFlow, GuaranteedDelimitationEvents, flowModel} = require("./dicom-flow");

const toIndeterminateLengthSequences = flowModel({
    onSequence: "toIndeterminateOnSequence",
    onSequenceDelimitation: "toIndeterminateOnSequenceDelimitation",
    onItem: "toIndeterminateOnItem",
    onItemDelimitation: "toIndeterminateOnItemDelimitation"
}, {
    indeterminateBytes: Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]),
    onSequence: function (part) {
        return this.toIndeterminateOnSequence(part).map(p => {
            if (p instanceof parts.SequencePart && !p.indeterminate) {
                return new parts.SequencePart(
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
        let out = this.toIndeterminateOnSequenceDelimitation(part);
        if (part.bytes.length <= 0)
            out.push(new parts.SequenceDelimitationPart(part.bigEndian, base.sequenceDelimitation(part.bigEndian)));
        return out;
    },
    onItem: function (part) {
        return this.toIndeterminateOnItem(part).map(p => {
            if (p instanceof parts.ItemPart && !this.inFragments.value && !p.indeterminate) {
                return new parts.ItemPart(
                    part.index,
                    base.indeterminateLength,
                    part.bigEndian,
                    base.concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes));
            }
            return p;
        });
    },
    onItemDelimitation: function (part) {
        let out = this.toIndeterminateOnItemDelimitation(part);
        if (part.bytes.length <= 0)
            out.push(new parts.ItemDelimitationPart(part.index, part.bigEndian, base.itemDelimitation(part.bigEndian)));
        return out;
    }
}, IdentityFlow, GuaranteedDelimitationEvents);

module.exports = {
    toIndeterminateLengthSequences: toIndeterminateLengthSequences
};
