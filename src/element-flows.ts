import { concat, emptyBuffer } from "./base";
import {createFlow, DeferToPartFlow, GuaranteedValueEvent, InFragments} from "./dicom-flow";
import {Element, FragmentElement, FragmentsElement, ItemDelimitationElement, ItemElement,
    preambleElement, SequenceDelimitationElement, SequenceElement, ValueElement,
} from "./elements";
import {DicomPart, FragmentsPart, HeaderPart, ItemDelimitationPart, ItemPart, PreamblePart,
    SequenceDelimitationPart, SequencePart, ValueChunk,
} from "./parts";
import {Value} from "./value";

export function elementFlow() {
    return createFlow(new class extends GuaranteedValueEvent(InFragments(DeferToPartFlow)) {
        private bytes: Buffer = emptyBuffer;
        private currentValue: ValueElement;
        private currentFragment: FragmentElement;

        public onPart(part: DicomPart): Element[] {

            if (part instanceof PreamblePart) {
                return [preambleElement];
            }

            if (part instanceof HeaderPart) {
                this.currentValue = new ValueElement(part.tag, part.vr, Value.empty(), part.bigEndian, part.explicitVR);
                this.bytes = emptyBuffer;
                return [];
            }

            if (part instanceof ItemPart && this.inFragments) {
                this.currentFragment = new FragmentElement(part.index, part.length, Value.empty(), part.bigEndian);
                this.bytes = emptyBuffer;
                return [];
            }

            if (part instanceof ValueChunk) {
                this.bytes = concat(this.bytes, part.bytes);
                if (part.last) {
                    if (this.inFragments) {
                        if (this.currentFragment === undefined) {
                            return [];
                        } else {
                            return [new FragmentElement(
                                this.currentFragment.index,
                                this.currentFragment.length,
                                new Value(this.bytes),
                                this.currentFragment.bigEndian)];
                        }
                    } else {
                        return [new ValueElement(
                            this.currentValue.tag,
                            this.currentValue.vr,
                            new Value(this.bytes),
                            this.currentValue.bigEndian,
                            this.currentValue.explicitVR)];
                        }
                } else {
                    return [];
                }
            }

            if (part instanceof SequencePart) {
                return [new SequenceElement(part.tag, part.length, part.bigEndian, part.explicitVR)];
            }

            if (part instanceof FragmentsPart) {
                return [new FragmentsElement(part.tag, part.vr, part.bigEndian, part.explicitVR)];
            }

            if (part instanceof ItemPart) {
                return [new ItemElement(part.index, part.length, part.bigEndian)];
            }

            if (part instanceof ItemDelimitationPart) {
                return [new ItemDelimitationElement(part.index, part.bigEndian)];
            }

            if (part instanceof SequenceDelimitationPart) {
                return [new SequenceDelimitationElement(part.bigEndian)];
            }

            return [];
        }
    }());
}
