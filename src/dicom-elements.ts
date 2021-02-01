import {
    appendToArray,
    bytesToUInt,
    concat,
    defaultCharacterSet,
    emptyBuffer,
    indeterminateLength,
    intToBytes,
    multiValueDelimiter,
    tagToBytes,
    tagToString,
} from './base';
import { Lookup } from './lookup';
import {
    DicomPart,
    FragmentsPart,
    HeaderPart,
    ItemDelimitationPart,
    ItemPart,
    PreamblePart,
    SequenceDelimitationPart,
    SequencePart,
    ValueChunk,
} from './dicom-parts';
import { Tag } from './tag';
import { Value } from './value';
import { VR } from './vr';
import { Elements } from './elements';

export class Element {
    constructor(public readonly bigEndian: boolean = false) {}

    public toBytes(): Buffer {
        return emptyBuffer;
    }
    public toParts(): DicomPart[] {
        return [];
    }
}

export class ElementSet {
    constructor(
        public readonly tag: number,
        public readonly vr: VR,
        public readonly bigEndian: boolean = false,
        public readonly explicitVR: boolean = true,
    ) {}

    public toBytes(): Buffer {
        return emptyBuffer;
    }
    public toElements(): Element[] {
        return [];
    }
}

export class UnknownElement extends Element {
    constructor(bigEndian?: boolean) {
        super(bigEndian);
    }
}

class PreambleElement extends Element {
    constructor() {
        super(false);
    }
    public toBytes(): Buffer {
        return concat(Buffer.from(new Array(128).fill(0)), Buffer.from('DICM'));
    }
    public toString(): string {
        return 'PreambleElement(0, ..., 0, D, I, C, M)';
    }
    public toParts(): DicomPart[] {
        return [new PreamblePart(this.toBytes())];
    }
}
export const preambleElement = new PreambleElement();

export class ValueElement extends ElementSet {
    public length: number;

    constructor(tag: number, vr: VR, public readonly value: Value, bigEndian?: boolean, explicitVR?: boolean) {
        super(tag, vr, bigEndian, explicitVR);
        this.length = value.length;
    }

    public setValue(value: Value): ValueElement {
        return new ValueElement(this.tag, this.vr, value.ensurePadding(this.vr), this.bigEndian, this.explicitVR);
    }
    public toBytes(): Buffer {
        return this.toParts()
            .map((p) => p.bytes)
            .reduce(concat);
    }
    public toParts(): DicomPart[] {
        const headerPart = HeaderPart.create(this.tag, this.vr, this.length, this.bigEndian, this.explicitVR);
        if (this.length > 0) {
            return [headerPart, new ValueChunk(this.bigEndian, this.value.bytes, true)];
        } else {
            return [headerPart];
        }
    }
    public toElements(): Element[] {
        return [this];
    }
    public toString(): string {
        const strings = this.value.toStrings(this.vr, this.bigEndian, defaultCharacterSet);
        const s = strings.join(multiValueDelimiter);
        const vm = strings.length + '';
        return (
            'ValueElement(' +
                tagToString(this.tag) +
                ' ' +
                this.vr.name +
                ' [' +
                s +
                '] # ' +
                this.length +
                ', ' +
                vm +
                ' ' +
                Lookup.keywordOf(this.tag) || '' + ')'
        );
    }
}

export class SequenceElement extends Element {
    public indeterminate: boolean;

    constructor(
        public readonly tag: number,
        public readonly length: number = indeterminateLength,
        bigEndian?: boolean,
        public readonly explicitVR: boolean = true,
    ) {
        super(bigEndian);
        this.tag = tag;
        this.indeterminate = this.length === indeterminateLength;
    }

    public toBytes(): Buffer {
        return HeaderPart.create(this.tag, VR.SQ, this.length, this.bigEndian, this.explicitVR).bytes;
    }
    public toParts(): DicomPart[] {
        return [new SequencePart(this.tag, this.length, this.bigEndian, this.explicitVR, this.toBytes())];
    }
    public toString(): string {
        return (
            'SequenceElement(' + tagToString(this.tag) + ' SQ # ' + this.length + ' ' + Lookup.keywordOf(this.tag) ||
            '' + ')'
        );
    }
}

export class FragmentsElement extends Element {
    constructor(
        public readonly tag: number,
        public readonly vr: VR,
        bigEndian?: boolean,
        public readonly explicitVR: boolean = true,
    ) {
        super(bigEndian);
    }

    public toBytes(): Buffer {
        return this.toParts()[0].bytes;
    }
    public toParts(): DicomPart[] {
        return [
            new FragmentsPart(
                this.tag,
                indeterminateLength,
                this.vr,
                this.bigEndian,
                this.explicitVR,
                HeaderPart.create(this.tag, this.vr, indeterminateLength, this.bigEndian, this.explicitVR).bytes,
            ),
        ];
    }
    public toString(): string {
        return (
            'FragmentsElement(' + tagToString(this.tag) + ' ' + this.vr.name + ' # ' + Lookup.keywordOf(this.tag) ||
            '' + ')'
        );
    }
}

export class ItemElement extends Element {
    public indeterminate: boolean;

    constructor(public readonly length = indeterminateLength, bigEndian?: boolean) {
        super(bigEndian);
        this.indeterminate = this.length === indeterminateLength;
    }

    public toBytes(): Buffer {
        return concat(tagToBytes(Tag.Item, this.bigEndian), intToBytes(this.length, this.bigEndian));
    }
    public toParts(): DicomPart[] {
        return [new ItemPart(this.length, this.bigEndian, this.toBytes())];
    }
    public toString(): string {
        return 'ItemElement(length = ' + this.length + ')';
    }
}

export class FragmentElement extends Element {
    constructor(public readonly length: number, public readonly value: Value, bigEndian?: boolean) {
        super(bigEndian);
    }

    public toBytes(): Buffer {
        return this.toParts()
            .map((p) => p.bytes)
            .reduce(concat);
    }
    public toParts(): DicomPart[] {
        const itemParts: DicomPart[] = new ItemElement(this.value.length, this.bigEndian).toParts();
        if (this.value.length !== 0) {
            itemParts.push(new ValueChunk(this.bigEndian, this.value.bytes, true));
        }
        return itemParts;
    }
    public toString(): string {
        return 'FragmentElement(length = ' + this.length + ')';
    }
}

export class ItemDelimitationElement extends Element {
    constructor(bigEndian?: boolean) {
        super(bigEndian);
    }

    public toBytes(): Buffer {
        return concat(tagToBytes(Tag.ItemDelimitationItem, this.bigEndian), Buffer.from([0, 0, 0, 0]));
    }
    public toParts(): DicomPart[] {
        return [new ItemDelimitationPart(this.bigEndian, this.toBytes())];
    }
    public toString(): string {
        return 'ItemDelimitationElement';
    }
}

export class SequenceDelimitationElement extends Element {
    constructor(bigEndian?: boolean) {
        super(bigEndian);
    }

    public toBytes(): Buffer {
        return concat(tagToBytes(Tag.SequenceDelimitationItem, this.bigEndian), Buffer.from([0, 0, 0, 0]));
    }
    public toParts(): DicomPart[] {
        return [new SequenceDelimitationPart(this.bigEndian, this.toBytes())];
    }
    public toString(): string {
        return 'SequenceDelimitationElement';
    }
}

export class Sequence extends ElementSet {
    public indeterminate: boolean;
    public size: number;

    constructor(
        public readonly tag: number,
        public readonly length: number = indeterminateLength,
        public readonly items: Item[] = [],
        bigEndian?: boolean,
        explicitVR?: boolean,
    ) {
        super(tag, VR.SQ, bigEndian, explicitVR);
        this.indeterminate = length === indeterminateLength;
        this.size = items.length;
    }

    public item(index: number): Item {
        return this.items.length >= index ? this.items[index - 1] : undefined;
    }
    public addItem(item: Item): Sequence {
        const newItems = appendToArray(item, this.items);
        const newLength = this.indeterminate ? this.length : this.length + item.toBytes().length;
        return new Sequence(this.tag, newLength, newItems, this.bigEndian, this.explicitVR);
    }
    public removeItem(index: number): Sequence {
        const newItems = this.items.slice();
        newItems.splice(index - 1, 1);
        const newLength = this.indeterminate ? this.length : this.length - this.item(index).toBytes().length;
        return new Sequence(this.tag, newLength, newItems, this.bigEndian, this.explicitVR);
    }
    public toBytes(): Buffer {
        return this.toElements()
            .map((e) => e.toBytes())
            .reduce(concat, emptyBuffer);
    }
    public toElements(): Element[] {
        const elements = [];
        elements.push(new SequenceElement(this.tag, this.length, this.bigEndian, this.explicitVR));
        for (let i = 1; i <= this.items.length; i++) {
            const itemElements = this.item(i).toElements();
            itemElements.forEach((e) => elements.push(e));
        }
        if (this.indeterminate) {
            elements.push(new SequenceDelimitationElement(this.bigEndian));
        }
        return elements;
    }
    public setItem(index: number, item: Item): Sequence {
        const newItems = this.items.slice();
        newItems[index - 1] = item;
        return new Sequence(this.tag, this.length, newItems, this.bigEndian, this.explicitVR);
    }
    public toString(): string {
        return (
            'Sequence(' +
                tagToString(this.tag) +
                ' SQ # ' +
                this.length +
                ' ' +
                this.size +
                ' ' +
                Lookup.keywordOf(this.tag) || '' + ')'
        );
    }
}

export class Item {
    public indeterminate: boolean;

    constructor(
        public readonly elements: Elements,
        public readonly length: number = indeterminateLength,
        public readonly bigEndian: boolean = false,
    ) {
        this.indeterminate = length === indeterminateLength;
    }

    public toElements(): Element[] {
        const elements: Element[] = [];
        elements.push(new ItemElement(this.length, this.bigEndian));
        this.elements.toElements(false).forEach((e) => elements.push(e));
        if (this.indeterminate) {
            elements.push(new ItemDelimitationElement(this.bigEndian));
        }
        return elements;
    }
    public toBytes(): Buffer {
        return this.toElements()
            .map((e) => e.toBytes())
            .reduce(concat);
    }
    public setElements(elements: Elements): Item {
        const newLength = this.indeterminate ? indeterminateLength : elements.toBytes(false).length;
        return new Item(elements, newLength, this.bigEndian);
    }
    public toString(): string {
        return 'Item(length = ' + this.length + ', elements size = ' + this.elements.size + ')';
    }
}

export class Fragment {
    constructor(
        public readonly length: number,
        public readonly value: Value,
        public readonly bigEndian: boolean = false,
    ) {}

    public toElement(): Element {
        return new FragmentElement(this.length, this.value, this.bigEndian);
    }
    public toString(): string {
        return 'Fragment(length = ' + this.length + ', value length = ' + this.value.length + ')';
    }
}

export class Fragments extends ElementSet {
    public size: number;

    constructor(
        public readonly tag: number,
        public readonly vr: VR,
        public readonly offsets: number[],
        public readonly fragments: Fragment[] = [],
        bigEndian?: boolean,
        explicitVR?: boolean,
    ) {
        super(tag, vr, bigEndian, explicitVR);
        this.size = fragments.length;
    }

    public fragment(index: number): Fragment {
        return this.fragments.length > index ? undefined : this.fragments[index - 1];
    }
    public frameCount(): number {
        return this.offsets === undefined && this.fragments.length === 0
            ? 0
            : this.offsets === undefined
            ? 1
            : this.offsets.length;
    }
    public addFragment(fragment: Fragment): Fragments {
        if (this.size === 0 && this.offsets === undefined) {
            const bytes = fragment.value.bytes;
            const offsets = [];
            for (let i = 0; i < bytes.length; i += 4) {
                offsets.push(bytesToUInt(bytes.slice(i), fragment.bigEndian));
            }
            return new Fragments(this.tag, this.vr, offsets, this.fragments, this.bigEndian, this.explicitVR);
        } else {
            return new Fragments(
                this.tag,
                this.vr,
                this.offsets,
                appendToArray(fragment, this.fragments),
                this.bigEndian,
                this.explicitVR,
            );
        }
    }
    public toBytes(): Buffer {
        return this.toElements()
            .map((e) => e.toBytes())
            .reduce(concat);
    }

    public toElements(): Element[] {
        const elements: Element[] = [];
        elements.push(new FragmentsElement(this.tag, this.vr, this.bigEndian, this.explicitVR));
        if (this.offsets !== undefined) {
            elements.push(
                new FragmentElement(
                    4 * this.offsets.length,
                    new Value(
                        this.offsets
                            .map((offset) => intToBytes(offset, this.bigEndian), this.bigEndian)
                            .reduce(concat, emptyBuffer),
                    ),
                    this.bigEndian,
                ),
            );
        } else {
            elements.push(new FragmentElement(0, Value.empty()));
        }
        for (let i = 1; i <= this.fragments.length; i++) {
            elements.push(this.fragment(i).toElement());
        }
        elements.push(new SequenceDelimitationElement(this.bigEndian));
        return elements;
    }
    public setFragment(index: number, fragment: Fragment): Fragments {
        const newFragments = this.fragments.slice();
        newFragments[index - 1] = fragment;
        return new Fragments(this.tag, this.vr, this.offsets, newFragments, this.bigEndian, this.explicitVR);
    }
    public toString(): string {
        return `Fragments(${tagToString(this.tag)} ${this.vr.name} # ${this.fragments.length} ${
            Lookup.keywordOf(this.tag) || ''
        })`;
    }
}
