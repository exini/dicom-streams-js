import { LocalDate, LocalTime, ZonedDateTime, ZoneId, ZoneOffset } from "js-joda";
import * as base from "./base";
import {CharacterSets} from "./character-sets";
import * as Lookup from "./lookup";
import {DicomPart, FragmentsPart, HeaderPart, ItemDelimitationPart, ItemPart, PreamblePart,
    SequenceDelimitationPart, SequencePart, ValueChunk} from "./parts";
import Tag from "./tag";
import {TagPath, TagPathItem, TagPathTag, TagPathTrunk} from "./tag-path";
import {Value} from "./value";
import * as VR from "./vr";

// tslint:disable: max-classes-per-file

export class Elements {

    public static empty(
        characterSets: CharacterSets = base.defaultCharacterSet,
        zoneOffset: ZoneId = base.systemZone): Elements {
        return new Elements(characterSets, zoneOffset, []);
    }

    public size: number;

    constructor(
        public characterSets = base.defaultCharacterSet,
        public zoneOffset: ZoneId = base.systemZone,
        public data: ElementSet[] = []) {
        this.size = data.length;
    }

    public elementByTag(tag: number): ElementSet { return this.data.find((e) => e.tag === tag); }

    public elementByPath(tagPath: TagPathTag): ElementSet {
        const tp = tagPath.previous();
        if (tp instanceof TagPathItem) {
            const e = this.nestedByPath(tp);
            return e === undefined ? undefined : e.elementByTag(tagPath.tag());
        }
        if (tp.isEmpty()) { return this.elementByTag(tagPath.tag()); }
        throw Error("Unsupported tag path type");
    }

    public valueElementByTag(tag: number): ValueElement { return this._valueByTag(tag, (f) => f); }
    public valueElementByPath(tagPath: TagPathTag): ValueElement { return this._valueByPath(tagPath, (f) => f); }
    public valueByTag(tag: number): Value {
        const e = this.valueElementByTag(tag);
        return e ? e.value : undefined;
    }
    public valueByPath(tagPath: TagPathTag): Value {
        const e = this.valueElementByPath(tagPath);
        return e ? e.value : undefined;
    }
    public bytesByTag(tag: number): Buffer {
        const e = this.valueByTag(tag);
        return e ? e.bytes : undefined;
    }
    public bytesByPath(tagPath: TagPathTag): Buffer {
        const e = this.valueByPath(tagPath);
        return e ? e.bytes : undefined;
    }
    public stringsByTag(tag: number): string[] {
        return this._valuesByTag(tag, (v) => v.value.toStrings(v.vr, v.bigEndian, this.characterSets));
    }
    public stringsByPath(tagPath: TagPathTag): string[] {
        return this._valuesByPath(tagPath, (v) => v.value.toStrings(v.vr, v.bigEndian, this.characterSets));
    }
    public stringByTag(tag: number): string {
        return this._valueByTag(tag, (v) => v.value.toString(v.vr, v.bigEndian, this.characterSets));
    }
    public stringByPath(tagPath: TagPathTag): string {
        return this._valueByPath(tagPath, (v) => v.value.toString(v.vr, v.bigEndian, this.characterSets));
    }
    public singleStringByTag(tag: number): string {
        return this._valueByTag(tag, (v) => v.value.toSingleString(v.vr, v.bigEndian, this.characterSets));
    }
    public singleStringByPath(tagPath: TagPathTag): string {
        return this._valueByPath(tagPath, (v) => v.value.toSingleString(v.vr, v.bigEndian, this.characterSets));
    }

    public numbersByTag(tag: number): number[] {
        return this._valuesByTag(tag, (v) => v.value.toNumbers(v.vr, v.bigEndian));
    }
    public numbersByPath(tagPath: TagPathTag): number[] {
        return this._valuesByPath(tagPath, (v) => v.value.toNumbers(v.vr, v.bigEndian));
    }
    public numberByTag(tag: number): number {
        return this._valueByTag(tag, (v) => v.value.toNumber(v.vr, v.bigEndian));
    }
    public numberByPath(tagPath: TagPathTag): number {
        return this._valueByPath(tagPath, (v) => v.value.toNumber(v.vr, v.bigEndian));
    }

    public datesByTag(tag: number): LocalDate[] {
        return this._valuesByTag(tag, (v) => v.value.toDates(v.vr));
    }
    public datesByPath(tagPath: TagPathTag): LocalDate[] {
        return this._valuesByPath(tagPath, (v) => v.value.toDates(v.vr));
    }
    public dateByTag(tag: number): LocalDate {
        return this._valueByTag(tag, (v) => v.value.toDate(v.vr));
    }
    public dateByPath(tagPath: TagPathTag): LocalDate {
        return this._valueByPath(tagPath, (v) => v.value.toDate(v.vr));
    }

    public timesByTag(tag: number): LocalTime[] {
        return this._valuesByTag(tag, (v) => v.value.toTimes(v.vr));
    }
    public timesByPath(tagPath: TagPathTag): LocalTime[] {
        return this._valuesByPath(tagPath, (v) => v.value.toTimes(v.vr));
    }
    public timeByTag(tag: number): LocalTime {
        return this._valueByTag(tag, (v) => v.value.toTime(v.vr));
    }
    public timeByPath(tagPath: TagPathTag): LocalTime {
        return this._valueByPath(tagPath, (v) => v.value.toTime(v.vr));
    }

    public dateTimesByTag(tag: number): ZonedDateTime[] {
        return this._valuesByTag(tag, (v) => v.value.toDateTimes(v.vr, this.zoneOffset));
    }
    public dateTimesByPath(tagPath: TagPathTag): ZonedDateTime[] {
        return this._valuesByPath(tagPath, (v) => v.value.toDateTimes(v.vr, this.zoneOffset));
    }
    public dateTimeByTag(tag: number): ZonedDateTime {
        return this._valueByTag(tag, (v) => v.value.toDateTime(v.vr, this.zoneOffset));
    }
    public dateTimeByPath(tagPath: TagPathTag): ZonedDateTime {
        return this._valueByPath(tagPath, (v) => v.value.toDateTime(v.vr, this.zoneOffset));
    }

    public sequenceByTag(tag: number): Sequence {
        const e = this.elementByTag(tag);
        return e instanceof Sequence ? e : undefined;
    }
    public sequenceByPath(tagPath: TagPathTag): Sequence {
        const e = this._traverseTrunk(this, tagPath.previous());
        return e ? e.sequenceByTag(tagPath.tag()) : undefined;
    }

    public itemByTag(tag: number, index: number): Item {
        const s = this.sequenceByTag(tag);
        return s ? s.item(index) : undefined;
    }
    public nestedByTag(tag: number, item: number): Elements {
        const i = this.itemByTag(tag, item);
        return i ? i.elements : undefined;
    }
    public nestedByPath(tagPath: TagPathItem): Elements {
        const e = this._traverseTrunk(this, tagPath.previous());
        return e ? e.nestedByTag(tagPath.tag(), tagPath.item) : undefined;
    }

    public fragmentsByTag(tag: number) {
        const e = this.elementByTag(tag);
        return e && e instanceof Fragments ? e : undefined;
    }

    public setElementSet(element: ElementSet) {
        if (element instanceof ValueElement && element.tag === Tag.SpecificCharacterSet) {
            return new Elements(
                CharacterSets.fromBytes(element.value.bytes),
                this.zoneOffset,
                this._insertOrdered(element));
        }
        if (element instanceof ValueElement && element.tag === Tag.TimezoneOffsetFromUTC) {
            const newOffset = parseZoneOffset(
                element.value.toSingleString(VR.SH, element.bigEndian, this.characterSets));
            const zone = newOffset || base.systemZone;
            return new Elements(this.characterSets, zone, this._insertOrdered(element));
        }
        return new Elements(this.characterSets, this.zoneOffset, this._insertOrdered(element));
    }

    public setCharacterSets(characterSets: CharacterSets) {
        return new Elements(characterSets, this.zoneOffset, this.data);
    }

    public setZoneOffset(zoneOffset: ZoneId) {
        return new Elements(this.characterSets, zoneOffset, this.data);
    }

    public filter(f: (e: ElementSet) => boolean) {
        return new Elements(this.characterSets, this.zoneOffset, this.data.filter(f));
    }

    public head() { return this.data.length > 0 ? this.data[0] : undefined; }

    public isEmpty() { return this.data.length <= 0; }

    public nonEmpty() { return !this.isEmpty(); }

    public contains(tag: number | TagPath) {
        return typeof tag === "number" ? this.data.map((e) => e.tag).includes(tag) :
            tag instanceof TagPathTag ? this.elementByPath(tag) !== undefined :
            tag instanceof TagPathItem ? this.nestedByPath(tag) !== undefined : false;
    }

    public sorted() {
        return new Elements(this.characterSets, this.zoneOffset, this.data.slice().sort((e1, e2) => e1.tag - e2.tag));
    }

    public toElements(withPreamble: boolean = true): Element[] {
        const elements = base.flatten(this.data.map((e) => e.toElements()));
        return withPreamble ? base.prependToArray(preambleElement, elements) : elements;
    }
    public toParts(withPreamble?: boolean): DicomPart[] {
        return base.flatten(this.toElements(withPreamble).map((e) => e.toParts()));
    }
    public toBytes(withPreamble: boolean = true): Buffer {
        return this.data
            .map((e) => e.toBytes())
            .reduce((p, e) => base.concat(p, e), withPreamble ? preambleElement.toBytes() : base.emptyBuffer);
    }
    public toStrings(indent: string): string[] {
        const space = " ";

        const space1 = (description: string): string => {
            return space.repeat(Math.max(0, 40 - description.length));
        };

        const space2 = (length: number): string => {
            return space.repeat(Math.max(0, 4 - (length + "").length));
        };

        return base.flatten(this.data.map((e) => {
            if (e instanceof ValueElement) {
                const strings = e.value.toStrings(e.vr, e.bigEndian, this.characterSets);
                const s = strings.join(base.multiValueDelimiter);
                const vm = strings.length + "";
                return [indent + base.tagToString(e.tag) + space + e.vr.name + space + s + space + space1(s) + " # " +
                    space2(e.length) + space + e.length + ", " + vm + space + Lookup.keywordOf(e.tag)];
            }

            if (e instanceof Sequence) {
                const hDescription = e.length === base.indeterminateLength ? "Sequence with indeterminate length" :
                    "Sequence with explicit length " + e.length;
                const heading = indent + base.tagToString(e.tag) + " SQ " + hDescription + space +
                    space1(hDescription) + " # " + space2(base.toInt32(e.length)) + space + base.toInt32(e.length) +
                    ", 1 " + Lookup.keywordOf(e.tag);
                const items = base.flatten(e.items.map((i) => {
                    const iDescription = i.indeterminate ? "Item with indeterminate length" :
                        "Item with explicit length " + i.length;
                    const itemHeading = indent + "  " + base.tagToString(Tag.Item) + " na " + iDescription + space +
                        space1(iDescription) + " # " + space2(base.toInt32(i.length)) + space + base.toInt32(i.length) +
                        ", 1 Item";
                    const elems = i.elements.toStrings(indent + "    ");
                    const itemDelimitation = indent + "  " + base.tagToString(Tag.ItemDelimitationItem) + " na " +
                        space.repeat(41) + " #     0, 0 ItemDelimitationItem";
                    elems.unshift(itemHeading);
                    elems.push(itemDelimitation);
                    return elems;
                }));
                const delimitation = indent + base.tagToString(Tag.SequenceDelimitationItem) + " na " +
                    space.repeat(41) + " #     0, 0 SequenceDelimitationItem";
                items.unshift(heading);
                items.push(delimitation);
                return items;
            }

            if (e instanceof Fragments) {
                const hDescription = "Fragments with " + e.size + " fragment(s)";
                const heading = indent + base.tagToString(e.tag) + space + e.vr.name + space + hDescription + space +
                    space1(hDescription) + " #    na, 1 " + Lookup.keywordOf(e.tag);
                let offsets: string[] = [];
                if (e.offsets !== undefined) {
                    const len = e.offsets.length;
                    const description = "Offsets table with " + len + " offset(s)";
                    offsets = [indent + space + space + base.tagToString(Tag.Item) + " na " + description + space +
                        space1(description) + " # " + space2(len * 4) + space + len * 4 + ", 1 Item"];
                }
                const fragments = e.fragments.map((f) => {
                    const description = "Fragment with length " + f.length;
                    return indent + space + space + base.tagToString(Tag.Item) + " na " + description + space +
                        space1(description) + " # " + space2(f.length) + space + f.length + ", 1 Item";
                });
                const delimitation = indent + base.tagToString(Tag.SequenceDelimitationItem) + " na " +
                    space.repeat(43) + " #     0, 0 SequenceDelimitationItem";
                offsets.unshift(heading);
                for (const fragment of fragments) {
                    offsets.push(fragment);
                }
                offsets.push(delimitation);
                return offsets;
            }

            return [];
        }));
    }
    public toString(): string {
        return this.toStrings("").join("\r\n");
    }

    private _valueByTag(tag: number, f: (v: ValueElement) => any): any {
        const e = this.elementByTag(tag);
        return (e && e instanceof ValueElement) ? f(e) : undefined;
    }

    private _valueByPath(tagPath: TagPathTag, f: (v: ValueElement) => any): any {
        const e = this.elementByPath(tagPath);
        return (e && e instanceof ValueElement) ? f(e) : undefined;
    }

    private _valuesByTag(tag: number, f: (v: ValueElement) => any): any {
        const e = this.elementByTag(tag);
        return (e && e instanceof ValueElement) ? f(e) : [];
    }

    private _valuesByPath(tagPath: TagPathTag, f: (v: ValueElement) => any): any {
        const e = this.elementByPath(tagPath);
        return (e && e instanceof ValueElement) ? f(e) : [];
    }

    private _traverseTrunk(elems: Elements, trunk: TagPathTrunk): Elements {
        if (trunk.isEmpty()) {
            return elems;
        } else {
            if (trunk instanceof TagPathItem) {
                const e = this._traverseTrunk(elems, trunk.previous());
                return e ? e.nestedByTag(trunk.tag(), trunk.item) : undefined;
            }
            throw Error("Unsupported tag path type");
        }
    }

    private _insertOrdered(element: ElementSet): ElementSet[] {
        if (this.isEmpty()) {
            return [element];
        } else {
            const b = [];
            let isBelow = true;
            this.data.forEach((e) => {
                if (isBelow && e.tag > element.tag) {
                    b.push(element);
                    isBelow = false;
                }
                if (e.tag === element.tag) {
                    b.push(element);
                    isBelow = false;
                } else {
                    b.push(e);
                }
            });
            if (isBelow) {
                b.push(element);
            }
            return b;
        }
    }

}

export class Element {
    constructor(public readonly bigEndian: boolean = false) {}

    public toBytes(): Buffer { return base.emptyBuffer; }
    public toParts(): DicomPart[] { return []; }
}

export class ElementSet {
    constructor(
        public readonly tag: number,
        public readonly vr: VR.VR,
        public readonly bigEndian: boolean = false,
        public readonly explicitVR: boolean = true) {}

    public toBytes(): Buffer { return base.emptyBuffer; }
    public toElements(): Element[] { return []; }
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
    public toBytes(): Buffer { return base.concat(Buffer.from(new Array(128).fill(0)), Buffer.from("DICM")); }
    public toString(): string { return "PreambleElement(0, ..., 0, D, I, C, M)"; }
    public toParts(): DicomPart[] { return [new PreamblePart(this.toBytes())]; }
}
export const preambleElement = new PreambleElement();

export class ValueElement extends ElementSet {

    public length: number;

    constructor(tag: number, vr: VR.VR, public readonly value: Value, bigEndian?: boolean, explicitVR?: boolean) {
        super(tag, vr, bigEndian, explicitVR);
        this.length = value.length;
    }

    public setValue(value: Value): ValueElement {
        return new ValueElement(this.tag, this.vr, value.ensurePadding(this.vr), this.bigEndian, this.explicitVR);
    }
    public toBytes(): Buffer { return this.toParts().map((p) => p.bytes).reduce(base.concat); }
    public toParts(): DicomPart[] {
        const headerPart = HeaderPart.create(
            this.tag, this.vr, this.length, this.bigEndian, this.explicitVR);
        if (this.length > 0) {
            return [headerPart, new ValueChunk(this.bigEndian, this.value.bytes, true)];
        } else {
            return [headerPart];
        }
    }
    public toElements(): Element[] { return [this]; }
    public toString(): string {
        const strings = this.value.toStrings(this.vr, this.bigEndian, base.defaultCharacterSet);
        const s = strings.join(base.multiValueDelimiter);
        const vm = strings.length + "";
        return "ValueElement(" + base.tagToString(this.tag) + " " + this.vr.name + " [" + s + "] # " +
            this.length + ", " + vm + " " + Lookup.keywordOf(this.tag) + ")";
    }
}

export class SequenceElement extends Element {

    public indeterminate: boolean;

    constructor(
        public readonly tag: number,
        public readonly length: number = base.indeterminateLength,
        bigEndian?: boolean,
        public readonly explicitVR: boolean = true) {
        super(bigEndian);
        this.tag = tag;
        this.indeterminate = this.length === base.indeterminateLength;
    }

    public toBytes(): Buffer {
        return HeaderPart.create(this.tag, VR.SQ, this.length, this.bigEndian, this.explicitVR).bytes;
    }
    public toParts(): DicomPart[] {
        return [new SequencePart(this.tag, this.length, this.bigEndian, this.explicitVR, this.toBytes())];
    }
    public toString(): string {
        return "SequenceElement(" + base.tagToString(this.tag) + " SQ # " + this.length + " " +
            Lookup.keywordOf(this.tag) + ")";
    }
}

export class FragmentsElement extends Element {
    constructor(
        public readonly tag: number,
        public readonly vr: VR.VR,
        bigEndian?: boolean,
        public readonly explicitVR: boolean = true) {
        super(bigEndian);
    }

    public toBytes(): Buffer { return this.toParts()[0].bytes; }
    public toParts(): DicomPart[] {
        return [new FragmentsPart(this.tag, base.indeterminateLength, this.vr, this.bigEndian, this.explicitVR,
            HeaderPart.create(this.tag, this.vr, base.indeterminateLength, this.bigEndian, this.explicitVR).bytes)];
    }
    public toString(): string {
        return "FragmentsElement(" + base.tagToString(this.tag) + " " + this.vr.name + " # " +
            Lookup.keywordOf(this.tag) + ")";
    }
}

export class FragmentElement extends Element {
    constructor(
        public readonly index: number,
        public readonly length: number,
        public readonly value: Value,
        bigEndian?: boolean) {
        super(bigEndian);
    }

    public toBytes(): Buffer { return this.toParts().map((p) => p.bytes).reduce(base.concat); }
    public toParts(): DicomPart[] {
        const itemParts: DicomPart[] = new ItemElement(this.index, this.value.length, this.bigEndian).toParts();
        if (this.value.length !== 0) {
            itemParts.push(new ValueChunk(this.bigEndian, this.value.bytes, true));
        }
        return itemParts;
    }
    public toString() { return "FragmentElement(index = " + this.index + ", length = " + this.length + ")"; }
}

export class ItemElement extends Element {

    public indeterminate: boolean;

    constructor(
        public readonly index: number,
        public readonly length = base.indeterminateLength,
        bigEndian?: boolean) {
        super(bigEndian);
        this.indeterminate = this.length === base.indeterminateLength;
    }

    public toBytes(): Buffer {
        return base.concat(base.tagToBytes(Tag.Item, this.bigEndian), base.intToBytes(this.length, this.bigEndian));
    }
    public toParts(): DicomPart[] { return [new ItemPart(this.index, this.length, this.bigEndian, this.toBytes())]; }
    public toString(): string { return "ItemElement(index = " + this.index + ", length = " + this.length + ")"; }
}

export class ItemDelimitationElement extends Element {
    constructor(public readonly index: number, bigEndian?: boolean) {
        super(bigEndian);
    }

    public toBytes(): Buffer {
        return base.concat(base.tagToBytes(Tag.ItemDelimitationItem, this.bigEndian), Buffer.from([0, 0, 0, 0]));
    }
    public toParts(): DicomPart[] { return [new ItemDelimitationPart(this.index, this.bigEndian, this.toBytes())]; }
    public toString(): string { return "ItemDelimitationElement(index = " + this.index + ")"; }
}

export class SequenceDelimitationElement extends Element {
    constructor(bigEndian?: boolean) {
        super(bigEndian);
    }

    public toBytes(): Buffer {
        return base.concat(base.tagToBytes(Tag.SequenceDelimitationItem, this.bigEndian), Buffer.from([0, 0, 0, 0]));
    }
    public toParts(): DicomPart[] { return [new SequenceDelimitationPart(this.bigEndian, this.toBytes())]; }
    public toString(): string { return "SequenceDelimitationElement"; }
}

export class Sequence extends ElementSet {

    public indeterminate: boolean;
    public size: number;

    constructor(
        public readonly tag: number,
        public readonly length: number = base.indeterminateLength,
        public readonly items: Item[] = [],
        bigEndian?: boolean,
        explicitVR?: boolean) {
        super(tag, VR.SQ, bigEndian, explicitVR);
        this.indeterminate = length === base.indeterminateLength;
        this.size = items.length;
    }

    public item(index: number): Item { return this.items.length >= index ? this.items[index - 1] : undefined; }
    public addItem(item: Item): Sequence {
        const newItems = base.appendToArray(item, this.items);
        const newLength = this.indeterminate ? this.length : this.length + item.toBytes().length;
        return new Sequence(this.tag, newLength, newItems, this.bigEndian, this.explicitVR);
    }
    public removeItem(index: number): Sequence {
        const newItems = this.items.slice();
        newItems.splice(index - 1, 1);
        const newLength = this.indeterminate ? this.length : this.length - this.item(index).toBytes().length;
        return new Sequence(this.tag, newLength, newItems, this.bigEndian, this.explicitVR);
    }
    public toBytes(): Buffer { return this.toElements().map((e) => e.toBytes()).reduce(base.concat, base.emptyBuffer); }
    public toElements(): Element[] {
        const elements = [];
        elements.push(new SequenceElement(this.tag, this.length, this.bigEndian, this.explicitVR));
        for (let i = 1; i <= this.items.length; i++) {
            const itemElements = this.item(i).toElements(i);
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
        return "Sequence(" + base.tagToString(this.tag) + " SQ # " + this.length + " " + this.size + " " +
            Lookup.keywordOf(this.tag) + ")";
    }
}

export class Item {

    public indeterminate: boolean;

    constructor(
        public readonly elements: Elements,
        public readonly length: number = base.indeterminateLength,
        public readonly bigEndian: boolean = false) {
        this.indeterminate = length === base.indeterminateLength;
    }

    public toElements(index: number): Element[] {
        const elements: Element[] = [];
        elements.push(new ItemElement(index, this.length, this.bigEndian));
        this.elements.toElements(false).forEach((e) => elements.push(e));
        if (this.indeterminate) {
            elements.push(new ItemDelimitationElement(index, this.bigEndian));
        }
        return elements;
    }
    public toBytes(): Buffer { return this.toElements(1).map((e) => e.toBytes()).reduce(base.concat); }
    public setElements(elements: Elements): Item {
        const newLength = this.indeterminate ? base.indeterminateLength : elements.toBytes(false).length;
        return new Item(elements, newLength, this.bigEndian);
    }
    public toString(): string {
        return "Item(length = " + this.length + ", elements size = " + this.elements.size + ")";
    }
}

export class Fragment {
    constructor(
        public readonly length: number,
        public readonly value: Value,
        public readonly bigEndian: boolean = false) {
    }

    public toElement(index: number): Element {
        return new FragmentElement(index, this.length, this.value, this.bigEndian);
    }
    public toString(): string {
        return "Fragment(length = " + this.length + ", value length = " + this.value.length + ")";
    }
}

export class Fragments extends ElementSet {

    public size: number;

    constructor(
        public readonly tag: number,
        public readonly vr: VR.VR,
        public readonly offsets: number[],
        public readonly fragments: Fragment[] = [],
        bigEndian?: boolean,
        explicitVR?: boolean) {
        super(tag, vr, bigEndian, explicitVR);
        this.size = fragments.length;
    }

    public fragment(index: number): Fragment {
        return this.fragments.length > index ? undefined : this.fragments[index - 1];
    }
    public frameCount(): number {
        return this.offsets === undefined && this.fragments.length === 0 ? 0 :
            this.offsets === undefined ?  1 : this.offsets.length;
    }
    public addFragment(fragment: Fragment): Fragments {
        if (this.size === 0 && this.offsets === undefined) {
            const bytes = fragment.value.bytes;
            const offsets = [];
            for (let i = 0; i < bytes.length; i += 4) {
                offsets.push(base.bytesToUInt(bytes.slice(i), fragment.bigEndian));
            }
            return new Fragments(this.tag, this.vr, offsets, this.fragments, this.bigEndian, this.explicitVR);
        } else {
            return new Fragments(
                this.tag,
                this.vr,
                this.offsets,
                base.appendToArray(fragment, this.fragments),
                this.bigEndian,
                this.explicitVR);
        }
    }
    public toBytes() { return this.toElements().map((e) => e.toBytes()).reduce(base.concat); }
    public toElements(): Element[] {
        const elements: Element[] = [];
        elements.push(new FragmentsElement(this.tag, this.vr, this.bigEndian, this.explicitVR));
        if (this.offsets !== undefined) {
            elements.push(
                new FragmentElement(
                    1,
                    4 * this.offsets.length,
                    new Value(
                        this.offsets.map((offset) => base.intToBytes(offset, this.bigEndian), this.bigEndian)
                            .reduce(base.concat, base.emptyBuffer)),
                    this.bigEndian));
        } else {
            elements.push(new FragmentElement(1, 0, Value.empty()));
        }
        for (let i = 1; i <= this.fragments.length; i++) {
            elements.push(this.fragment(i).toElement(i + 1));
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
        return "Fragments(" + base.tagToString(this.tag) + " " + this.vr.name + " # " + this.fragments.length + " " +
            Lookup.keywordOf(this.tag) + ")";
    }
}

export function parseZoneOffset(s: string): ZoneOffset {
    if (s.length < 5) { return undefined; }
    return ZoneOffset.ofTotalMinutes(
        parseInt(s.slice(0, 1) + (parseInt(s.slice(1, 3), 10) * 60 + parseInt(s.slice(3, 5), 10)), 10));
}
