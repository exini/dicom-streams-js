import { Transform } from 'stream';
import { concat, prependToArray } from './base';
import { CharacterSets } from './character-sets';
import {
    createFlow,
    DeferToPartFlow,
    EndEvent,
    GuaranteedDelimitationEvents,
    GuaranteedValueEvent,
    InFragments,
    ItemDelimitationPartMarker,
    sequenceDelimitationPartMarker,
    TagPathTracking,
    valueChunkMarker,
} from './dicom-flow';
import { Elements, ValueElement } from './elements';
import { DicomPart, ElementsPart, HeaderPart, ValueChunk } from './parts';
import { Tag } from './tag';
import { TagPath } from './tag-path';
import { Value } from './value';

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
            private reachedEnd = false;
            private currentBufferSize = 0;
            private currentElement: ValueElement = undefined;
            private buffer: DicomPart[] = [];
            private elements = Elements.empty();

            public onEnd(): DicomPart[] {
                return this.reachedEnd ? [] : this.elementsAndBuffer();
            }

            public onPart(part: DicomPart): DicomPart[] {
                if (this.reachedEnd) {
                    return [part];
                } else {
                    if (maxBufferSize > 0 && this.currentBufferSize > maxBufferSize) {
                        throw Error('Error collecting elements: max buffer size exceeded');
                    }

                    if (
                        part !== valueChunkMarker &&
                        part !== sequenceDelimitationPartMarker &&
                        !(part instanceof ItemDelimitationPartMarker)
                    ) {
                        this.buffer.push(part);
                        this.currentBufferSize += part.bytes.length;
                    }

                    if ('tag' in part && stopCondition(this.tagPath)) {
                        return this.elementsAndBuffer();
                    }

                    if (
                        part instanceof HeaderPart &&
                        (tagCondition(this.tagPath) || part.tag === Tag.SpecificCharacterSet)
                    ) {
                        this.currentElement = new ValueElement(
                            part.tag,
                            part.vr,
                            Value.empty(),
                            part.bigEndian,
                            part.explicitVR,
                        );
                        return [];
                    }

                    if (part instanceof HeaderPart) {
                        this.currentElement = undefined;
                        return [];
                    }

                    if (part instanceof ValueChunk) {
                        if (this.currentElement !== undefined) {
                            const element = this.currentElement;
                            const updatedElement = new ValueElement(
                                element.tag,
                                element.vr,
                                Value.fromBuffer(element.vr, concat(element.value.bytes, part.bytes)),
                                element.bigEndian,
                                element.explicitVR,
                            );
                            this.currentElement = updatedElement;
                            if (part.last) {
                                if (updatedElement.tag === Tag.SpecificCharacterSet) {
                                    this.elements = this.elements.setCharacterSets(
                                        CharacterSets.fromBytes(updatedElement.value.bytes),
                                    );
                                }
                                if (tagCondition(this.tagPath)) {
                                    this.elements = this.elements.setElementSet(updatedElement);
                                }
                                this.currentElement = undefined;
                            }
                        }

                        return [];
                    }

                    return [];
                }
            }

            private elementsAndBuffer(): DicomPart[] {
                const parts = prependToArray(new ElementsPart(label, this.elements), this.buffer);

                this.reachedEnd = true;
                this.buffer = [];
                this.currentBufferSize = 0;

                return parts;
            }
        })(),
    );
}

export function collectFromTagPathsFlow(tagPaths: TagPath[], label: string, maxBufferSize?: number): Transform {
    const maxTag = tagPaths.length > 0 ? Math.max(...tagPaths.map((t) => t.head().tag())) : 0;
    const tagCondition = (tagPath: TagPath): boolean => tagPaths.some((tp) => tagPath.startsWith(tp));
    const stopCondition =
        tagPaths.length > 0
            ? (tagPath: TagPath): boolean => tagPath.isRoot() && tagPath.tag() > maxTag
            : (): boolean => true;

    return collectFlow(tagCondition, stopCondition, label, maxBufferSize);
}
