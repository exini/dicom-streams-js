const base = require("./base");
const parts = require("./parts");
const {Value} = require("./value");
const {DeferToPartFlow, GuaranteedDelimitationEvents, GuaranteedValueEvent, sequenceDelimitationPartMarker, ItemDelimitationPartMarker, flow} = require("./dicom-flow");
const {preambleElement, FragmentElement, ValueElement, FragmentsElement, SequenceElement, SequenceDelimitationElement, ItemElement, ItemDelimitationElement} = require("./elements");

const elementFlow = function () {
    return flow({}, {

        _bytes: { value: base.emptyBuffer },
        _currentValue: { value: undefined },
        _currentFragment: { value: undefined },

        onPart: function (part) {
            console.log(part);

            if (part instanceof parts.PreamblePart)
                return [preambleElement];

            if (part instanceof parts.HeaderPart) {
                this._currentValue.value = new ValueElement(part.tag, part.vr, Value.empty(), part.bigEndian, part.explicitVR);
                this._bytes.value = base.emptyBuffer;
                return [];
            }

            if (part instanceof parts.ItemPart && this.inFragments()) {
                this._currentFragment.value = new FragmentElement(part.index, part.length, Value.empty(), part.bigEndian);
                this._bytes.value = base.emptyBuffer;
                return [];
            }

            if (part instanceof parts.ValueChunk) {
                this._bytes.value = base.concat(this._bytes.value, part.bytes);
                if (part.last)
                    if (this.inFragments())
                        if (this._currentFragment.value === undefined)
                            return [];
                        else
                            return [new FragmentElement(
                                this._currentFragment.value.index,
                                this._currentFragment.value.length,
                                new Value(this._bytes.value),
                                this._currentFragment.value.bigEndian)];
                    else
                        return [new ValueElement(
                            this._currentValue.value.tag,
                            this._currentValue.value.vr,
                            new Value(this._bytes.value),
                            this._currentValue.value.bigEndian,
                            this._currentValue.value.explicitVR)];
                else
                    return [];
            }

            if (part instanceof parts.SequencePart)
                return [new SequenceElement(part.tag, part.length, part.bigEndian, part.explicitVR)];

            if (part instanceof parts.FragmentsPart)
                return [new FragmentsElement(part.tag, part.vr, part.bigEndian, part.explicitVR)];

            if (part instanceof parts.ItemPart)
                return [new ItemElement(part.index, part.length, part.bigEndian)];

            if (part instanceof ItemDelimitationPartMarker)
                return [new ItemDelimitationElement(part.index, true, part.bigEndian)];

            if (part instanceof parts.ItemDelimitationPart)
                return [new ItemDelimitationElement(part.index, false, part.bigEndian)];

            if (part === sequenceDelimitationPartMarker)
                return [new SequenceDelimitationElement(true, part.bigEndian)];

            if (part instanceof parts.SequenceDelimitationPart)
                return [new SequenceDelimitationElement(false, part.bigEndian)];

            return [];
        }
    }, DeferToPartFlow, GuaranteedValueEvent, GuaranteedDelimitationEvents);
};

module.exports = {
    elementFlow: elementFlow
};