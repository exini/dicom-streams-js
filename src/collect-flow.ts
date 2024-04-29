import { Transform } from 'stream';
import { concat, prependToArray, emptyBuffer } from './base';
import {
    createFlow,
    DeferToPartFlow,
    EndEvent,
    GuaranteedDelimitationEvents,
    GuaranteedValueEvent,
    InFragments,
    ItemDelimitationPartMarker,
    SequenceDelimitationPartMarker,
    TagPathTracking,
    ValueChunkMarker,
} from './dicom-flow';
import {
    Element,
    ValueElement,
    FragmentElement,
    SequenceElement,
    FragmentsElement,
    ItemElement,
    ItemDelimitationElement,
    SequenceDelimitationElement,
} from './dicom-elements';
import {
    DicomPart,
    ElementsPart,
    HeaderPart,
    ValueChunk,
    ItemPart,
    SequencePart,
    FragmentsPart,
    ItemDelimitationPart,
    SequenceDelimitationPart,
} from './dicom-parts';
import { TagPath } from './tag-path';
import { Value } from './value';
import { ElementsBuilder } from './elements-builder';
import { TagTree } from './tag-tree';

export function collectFlow(
    tagCondition: (t: TagPath) => boolean,
    stopCondition: (t: TagPath) => boolean,
    label: string,
    maxBufferSize = 1000000,
): Transform {
    return createFlow(
        new (class extends EndEvent(
            TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(DeferToPartFlow)))),
        ) {
            private buffer: DicomPart[] = [];
            private currentBufferSize = 0;
            private hasEmitted = false;
            private bytes: Buffer = emptyBuffer;
            private currentValue: ValueElement = undefined;
            private currentFragment: FragmentElement = undefined;

            private builder = new ElementsBuilder();

            private elementsAndBuffer(): DicomPart[] {
                const parts = prependToArray(new ElementsPart(label, this.builder.build()), this.buffer);

                this.hasEmitted = true;
                this.buffer = [];
                this.currentBufferSize = 0;

                return parts;
            }

            private maybeAdd(element: Element): ElementsBuilder {
                return tagCondition(this.tagPath)
                    ? this.builder.addElement(element)
                    : this.builder.noteElement(element);
            }

            public onEnd(): DicomPart[] {
                return this.hasEmitted ? [] : this.elementsAndBuffer();
            }

            public onPart(part: DicomPart): DicomPart[] {
                if (this.hasEmitted) {
                    return [part];
                } else {
                    if (maxBufferSize > 0 && this.currentBufferSize > maxBufferSize) {
                        throw Error('Error collecting elements: max buffer size exceeded');
                    }

                    if (
                        !(part instanceof ValueChunkMarker) &&
                        !(part instanceof SequenceDelimitationPartMarker) &&
                        !(part instanceof ItemDelimitationPartMarker)
                    ) {
                        this.buffer.push(part);
                        this.currentBufferSize += part.bytes.length;
                    }

                    if ('tag' in part && stopCondition(this.tagPath)) {
                        return this.elementsAndBuffer();
                    }

                    if (part instanceof HeaderPart) {
                        this.currentValue = new ValueElement(
                            part.tag,
                            part.vr,
                            Value.empty(),
                            part.bigEndian,
                            part.explicitVR,
                        );
                        this.bytes = emptyBuffer;
                        return [];
                    }

                    if (part instanceof ItemPart && this.inFragments) {
                        this.currentFragment = new FragmentElement(part.length, Value.empty(), part.bigEndian);
                        this.bytes = emptyBuffer;
                        return [];
                    }

                    if (part instanceof ValueChunk) {
                        this.bytes = concat(this.bytes, part.bytes);
                        if (part.last) {
                            if (this.inFragments && this.currentFragment) {
                                this.maybeAdd(
                                    new FragmentElement(
                                        this.currentFragment.length,
                                        new Value(this.bytes),
                                        this.currentFragment.bigEndian,
                                    ),
                                );
                            } else if (this.currentValue) {
                                this.maybeAdd(
                                    new ValueElement(
                                        this.currentValue.tag,
                                        this.currentValue.vr,
                                        new Value(this.bytes),
                                        this.currentValue.bigEndian,
                                        this.currentValue.explicitVR,
                                    ),
                                );
                            }
                            this.currentFragment = undefined;
                            this.currentValue = undefined;
                        }

                        return [];
                    }

                    if (part instanceof SequencePart) {
                        this.maybeAdd(new SequenceElement(part.tag, part.length, part.bigEndian, part.explicitVR));
                        return [];
                    }
                    if (part instanceof FragmentsPart) {
                        this.maybeAdd(new FragmentsElement(part.tag, part.vr, part.bigEndian, part.explicitVR));
                        return [];
                    }
                    if (part instanceof ItemPart) {
                        this.maybeAdd(new ItemElement(part.length, part.bigEndian));
                        return [];
                    }
                    if (part instanceof ItemDelimitationPartMarker) {
                        return [];
                    }
                    if (part instanceof ItemDelimitationPart) {
                        this.maybeAdd(new ItemDelimitationElement(part.bigEndian));
                        return [];
                    }
                    if (part instanceof SequenceDelimitationPartMarker) {
                        return [];
                    }
                    if (part instanceof SequenceDelimitationPart) {
                        this.maybeAdd(new SequenceDelimitationElement(part.bigEndian));
                        return [];
                    }
                    return [];
                }
            }
        })(),
    );
}

export function collectFromTagPathsFlow(allowlist: TagTree[], label: string, maxBufferSize?: number): Transform {
    const maxTag = allowlist.length > 0 ? Math.max(...allowlist.map((t) => t.head().tag())) : 0;
    const tagCondition = (currentPath: TagPath): boolean =>
        allowlist.find((t) => t.hasTrunk(currentPath) || t.isTrunkOf(currentPath)) !== undefined;
    const stopCondition = (tagPath: TagPath): boolean =>
        allowlist.length === 0 || (tagPath.isRoot() && tagPath.tag() > maxTag);

    return collectFlow(tagCondition, stopCondition, label, maxBufferSize);
}
