import { ZoneId } from "js-joda";
import * as base from "./base";
import {CharacterSets} from "./character-sets";
import {
    Element, Elements, ElementSet, Fragment, FragmentElement, Fragments, FragmentsElement, Item,
    ItemDelimitationElement, ItemElement, parseZoneOffset, Sequence, SequenceDelimitationElement,
    SequenceElement, ValueElement } from "./elements";
import Tag from "./tag";
import * as VR from "./vr";

// tslint:disable: max-classes-per-file

export class ElementsBuilder {

    private builderStack: DatasetBuilder[] = [new DatasetBuilder(base.defaultCharacterSet, base.systemZone)];
    private sequenceStack: Sequence[] = [];
    private lengthStack: Array<{element: Element, bytesLeft: number}> = [];
    private fragments: Fragments;

    public addElement(element: Element) {
        if (element instanceof ValueElement) {
            this.subtractLength(element.length + element.vr.headerLength);
            const builder = this.builderStack[0];
            builder.addElementSet(element);
            this.maybeDelimit();
        } else if (element instanceof FragmentsElement) {
            this.subtractLength(element.vr.headerLength);
            this.updateFragments(
                new Fragments(element.tag, element.vr, undefined, [], element.bigEndian, element.explicitVR));
            this.maybeDelimit();
        } else if (element instanceof FragmentElement) {
            this.subtractLength(8 + element.length);
            if (this.fragments !== undefined) {
                const updatedFragments = this.fragments.addFragment(
                    new Fragment(element.length, element.value, element.bigEndian));
                this.updateFragments(updatedFragments);
            }
            this.maybeDelimit();
        } else if (element instanceof SequenceDelimitationElement && this.hasFragments()) {
            this.subtractLength(8);
            const builder = this.builderStack[0];
            builder.addElementSet(this.fragments);
            this.updateFragments(undefined);
            this.maybeDelimit();
        } else if (element instanceof SequenceElement) {
            this.subtractLength(12);
            if (!element.indeterminate) {
                this.pushLength(element, element.length);
            }
            this.pushSequence(new Sequence(element.tag, element.length, [], element.bigEndian, element.explicitVR));
            this.maybeDelimit();
        } else if (element instanceof ItemElement && this.hasSequence()) {
            this.subtractLength(8);
            const builder = this.builderStack[0];
            const sequence = this.sequenceStack[0].addItem(
                new Item(Elements.empty(), element.length, element.bigEndian));
            if (!element.indeterminate) {
                this.pushLength(element, element.length);
            }
            this.pushBuilder(new DatasetBuilder(builder.characterSets, builder.zoneOffset));
            this.updateSequence(sequence);
            this.maybeDelimit();
        } else if (element instanceof ItemDelimitationElement && this.hasSequence()) {
            this.subtractLength(8);
            this.endItem();
            this.maybeDelimit();
        } else if (element instanceof SequenceDelimitationElement && this.hasSequence()) {
            this.subtractLength(8);
            this.endSequence();
            this.maybeDelimit();
        }
    }

    public currentDepth(): number {
        return this.sequenceStack.length;
    }

    public result(): Elements {
        return this.builderStack.length === 0 ? Elements.empty() : this.builderStack[0].result();
    }
    private updateSequence(sequence: Sequence): void {
        if (this.sequenceStack.length === 0) {
            this.sequenceStack = [sequence];
        } else {
            this.sequenceStack[0] = sequence;
        }
    }
    private updateFragments(fragments: Fragments): void { this.fragments = fragments; }
    private subtractLength(length: number): void { this.lengthStack.forEach((l) => l.bytesLeft -= length); }
    private pushBuilder(builder: DatasetBuilder): void { this.builderStack.unshift(builder); }
    private pushSequence(sequence: Sequence): void { this.sequenceStack.unshift(sequence); }
    private pushLength(element: Element, length: number) {
        this.lengthStack.unshift({ element, bytesLeft: length });
    }
    private popBuilder(): void { this.builderStack.shift(); }
    private popSequence(): void { this.sequenceStack.shift(); }
    private hasSequence(): boolean { return this.sequenceStack.length > 0; }
    private hasFragments(): boolean { return this.fragments !== undefined; }
    private endItem(): void {
        const builder = this.builderStack[0];
        const sequence = this.sequenceStack[0];
        const elements = builder.result();
        const items = sequence.items;
        if (items.length > 0) {
            items[items.length - 1] = items[items.length - 1].setElements(elements);
            const updatedSequence =
                new Sequence(sequence.tag, sequence.length, items, sequence.bigEndian, sequence.explicitVR);
            this.popBuilder();
            this.updateSequence(updatedSequence);
        }
    }
    private endSequence(): void {
        const sequence = this.sequenceStack[0];
        const builder = this.builderStack[0];
        builder.addElementSet(sequence);
        this.popSequence();
    }
    private maybeDelimit(): void {
        const delimits = this.lengthStack.filter((e) => e.bytesLeft <= 0);
        if (delimits.length > 0) {
            this.lengthStack = this.lengthStack.filter((e) => e.bytesLeft > 0);
            delimits.forEach((e) => {
                if (e.element instanceof ItemElement) {
                    this.endItem();
                } else {
                    this.endSequence();
                }
            });
        }
    }
}

class DatasetBuilder {

    private data = new Array<ElementSet>(64);
    private pos = 0;

    constructor(public characterSets: CharacterSets, public zoneOffset: ZoneId) {}

    public addElementSet(elementSet: ElementSet): DatasetBuilder {
        if (elementSet instanceof ValueElement && elementSet.tag === Tag.SpecificCharacterSet) {
            this.characterSets = CharacterSets.fromBytes(elementSet.value.bytes);
        } else if (elementSet instanceof ValueElement && elementSet.tag === Tag.TimezoneOffsetFromUTC) {
            const newOffset = parseZoneOffset(
                elementSet.value.toSingleString(VR.SH, elementSet.bigEndian, this.characterSets));
            this.zoneOffset = newOffset || this.zoneOffset;
        }

        if (this.data.length <= this.pos) {
            this.data.length *= 2;
        }
        this.data[this.pos++] = elementSet;

        return this;
    }

    public result(): Elements {
        return new Elements(this.characterSets, this.zoneOffset, this.data.slice(0, this.pos));
    }
}
