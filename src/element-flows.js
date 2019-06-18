const base = require("./base");
const {PreamblePart, HeaderPart, ValueChunk, SequencePart, SequenceDelimitationPart, ItemPart, ItemDelimitationPart,
    FragmentsPart} = require("./parts");
const {Value} = require("./value");
const {DeferToPartFlow, GuaranteedDelimitationEvents, GuaranteedValueEvent, InFragments, sequenceDelimitationPartMarker,
    ItemDelimitationPartMarker, create} = require("./dicom-flow");
const {preambleElement, FragmentElement, ValueElement, FragmentsElement, SequenceElement, SequenceDelimitationElement,
    ItemElement, ItemDelimitationElement} = require("./elements");

const elementFlow = function () {
    return create(new class extends GuaranteedValueEvent(InFragments(DeferToPartFlow)) {
        constructor() {
            super();
            this.bytes = base.emptyBuffer;
            this.currentValue = undefined;
            this.currentFragment = undefined;
        }

        onPart(part) {

            if (part instanceof PreamblePart)
                return [preambleElement];

            if (part instanceof HeaderPart) {
                this.currentValue = new ValueElement(part.tag, part.vr, Value.empty(), part.bigEndian, part.explicitVR);
                this.bytes = base.emptyBuffer;
                return [];
            }

            if (part instanceof ItemPart && this.inFragments) {
                this.currentFragment = new FragmentElement(part.index, part.length, Value.empty(), part.bigEndian);
                this.bytes = base.emptyBuffer;
                return [];
            }

            if (part instanceof ValueChunk) {
                this.bytes = base.concat(this.bytes, part.bytes);
                if (part.last)
                    if (this.inFragments)
                        if (this.currentFragment === undefined)
                            return [];
                        else
                            return [new FragmentElement(
                                this.currentFragment.index,
                                this.currentFragment.length,
                                new Value(this.bytes),
                                this.currentFragment.bigEndian)];
                    else
                        return [new ValueElement(
                            this.currentValue.tag,
                            this.currentValue.vr,
                            new Value(this.bytes),
                            this.currentValue.bigEndian,
                            this.currentValue.explicitVR)];
                else
                    return [];
            }

            if (part instanceof SequencePart)
                return [new SequenceElement(part.tag, part.length, part.bigEndian, part.explicitVR)];

            if (part instanceof FragmentsPart)
                return [new FragmentsElement(part.tag, part.vr, part.bigEndian, part.explicitVR)];

            if (part instanceof ItemPart)
                return [new ItemElement(part.index, part.length, part.bigEndian)];

            if (part instanceof ItemDelimitationPart)
                return [new ItemDelimitationElement(part.index, part.bigEndian)];

            if (part instanceof SequenceDelimitationPart)
                return [new SequenceDelimitationElement(part.bigEndian)];

            return [];
        }
    });
};

module.exports = {
    elementFlow: elementFlow
};