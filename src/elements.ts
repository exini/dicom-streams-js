import { LocalDate, LocalTime, ZonedDateTime, ZoneId, ZoneOffset } from 'js-joda';
import { Element, ElementSet, ValueElement, Sequence, Item, Fragments, preambleElement } from './dicom-elements';
import {
    concat,
    defaultCharacterSet,
    emptyBuffer,
    flatten,
    indeterminateLength,
    multiValueDelimiter,
    prependToArray,
    systemZone,
    tagToString,
    toInt32,
} from './base';
import { CharacterSets } from './character-sets';
import { Lookup } from './lookup';
import { DicomPart } from './dicom-parts';
import { Tag } from './tag';
import { TagPath, TagPathItem, TagPathTag, TagPathTrunk, TagPathSequence, emptyTagPath } from './tag-path';
import { Value } from './value';
import { VR } from './vr';
import { PersonName } from './person-name';

export function parseZoneOffset(s: string): ZoneOffset {
    if (s.length < 5) {
        return undefined;
    }
    try {
        return ZoneOffset.ofTotalMinutes(
            parseInt(s.slice(0, 1) + (parseInt(s.slice(1, 3), 10) * 60 + parseInt(s.slice(4, 6), 10)), 10),
        );
    } catch (error) {
        return undefined;
    }
}

export class Elements {
    public static empty(characterSets: CharacterSets = defaultCharacterSet, zoneOffset: ZoneId = systemZone): Elements {
        return new Elements(characterSets, zoneOffset, []);
    }

    public size: number;

    constructor(
        public characterSets = defaultCharacterSet,
        public zoneOffset: ZoneId = systemZone,
        public data: ElementSet[] = [],
    ) {
        this.size = data.length;
    }

    public elementByTag(tag: number): ElementSet | undefined {
        return this.data.find((e) => e.tag === tag);
    }

    public elementByPath(tagPath: TagPathTag): ElementSet | undefined {
        const tp = tagPath.previous();
        if (tp instanceof TagPathItem) {
            const e = this.nestedByPath(tp);
            return e === undefined ? undefined : e.elementByTag(tagPath.tag());
        }
        if (tp.isEmpty()) {
            return this.elementByTag(tagPath.tag());
        }
        throw Error('Unsupported tag path type');
    }

    public valueElementByTag(tag: number): ValueElement | undefined {
        return this._valueByTag(tag, (f) => f);
    }
    public valueElementByPath(tagPath: TagPathTag): ValueElement | undefined {
        return this._valueByPath(tagPath, (f) => f);
    }
    public valueByTag(tag: number): Value | undefined {
        const e = this.valueElementByTag(tag);
        return e ? e.value : undefined;
    }
    public valueByPath(tagPath: TagPathTag): Value | undefined {
        const e = this.valueElementByPath(tagPath);
        return e ? e.value : undefined;
    }
    public bytesByTag(tag: number): Buffer | undefined {
        const e = this.valueByTag(tag);
        return e ? e.bytes : undefined;
    }
    public bytesByPath(tagPath: TagPathTag): Buffer | undefined {
        const e = this.valueByPath(tagPath);
        return e ? e.bytes : undefined;
    }
    public stringsByTag(tag: number): string[] {
        return this._valuesByTag(tag, (v) => v.value.toStrings(v.vr, v.bigEndian, this.characterSets));
    }
    public stringsByPath(tagPath: TagPathTag): string[] {
        return this._valuesByPath(tagPath, (v) => v.value.toStrings(v.vr, v.bigEndian, this.characterSets));
    }
    public stringByTag(tag: number): string | undefined {
        return this._valueByTag(tag, (v) => v.value.toString(v.vr, v.bigEndian, this.characterSets));
    }
    public stringByPath(tagPath: TagPathTag): string | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toString(v.vr, v.bigEndian, this.characterSets));
    }
    public singleStringByTag(tag: number): string | undefined {
        return this._valueByTag(tag, (v) => v.value.toSingleString(v.vr, v.bigEndian, this.characterSets));
    }
    public singleStringByPath(tagPath: TagPathTag): string | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toSingleString(v.vr, v.bigEndian, this.characterSets));
    }

    public numbersByTag(tag: number): number[] {
        return this._valuesByTag(tag, (v) => v.value.toNumbers(v.vr, v.bigEndian));
    }
    public numbersByPath(tagPath: TagPathTag): number[] {
        return this._valuesByPath(tagPath, (v) => v.value.toNumbers(v.vr, v.bigEndian));
    }
    public numberByTag(tag: number): number | undefined {
        return this._valueByTag(tag, (v) => v.value.toNumber(v.vr, v.bigEndian));
    }
    public numberByPath(tagPath: TagPathTag): number | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toNumber(v.vr, v.bigEndian));
    }

    public datesByTag(tag: number): LocalDate[] {
        return this._valuesByTag(tag, (v) => v.value.toDates(v.vr));
    }
    public datesByPath(tagPath: TagPathTag): LocalDate[] {
        return this._valuesByPath(tagPath, (v) => v.value.toDates(v.vr));
    }
    public dateByTag(tag: number): LocalDate | undefined {
        return this._valueByTag(tag, (v) => v.value.toDate(v.vr));
    }
    public dateByPath(tagPath: TagPathTag): LocalDate | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toDate(v.vr));
    }

    public timesByTag(tag: number): LocalTime[] {
        return this._valuesByTag(tag, (v) => v.value.toTimes(v.vr));
    }
    public timesByPath(tagPath: TagPathTag): LocalTime[] {
        return this._valuesByPath(tagPath, (v) => v.value.toTimes(v.vr));
    }
    public timeByTag(tag: number): LocalTime | undefined {
        return this._valueByTag(tag, (v) => v.value.toTime(v.vr));
    }
    public timeByPath(tagPath: TagPathTag): LocalTime | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toTime(v.vr));
    }

    public dateTimesByTag(tag: number): ZonedDateTime[] {
        return this._valuesByTag(tag, (v) => v.value.toDateTimes(v.vr, this.zoneOffset));
    }
    public dateTimesByPath(tagPath: TagPathTag): ZonedDateTime[] {
        return this._valuesByPath(tagPath, (v) => v.value.toDateTimes(v.vr, this.zoneOffset));
    }
    public dateTimeByTag(tag: number): ZonedDateTime | undefined {
        return this._valueByTag(tag, (v) => v.value.toDateTime(v.vr, this.zoneOffset));
    }
    public dateTimeByPath(tagPath: TagPathTag): ZonedDateTime | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toDateTime(v.vr, this.zoneOffset));
    }

    public personNamesByTag(tag: number): PersonName[] {
        return this._valuesByTag(tag, (v) => v.value.toPersonNames(v.vr, this.characterSets));
    }
    public personNamesByPath(tagPath: TagPathTag): PersonName[] {
        return this._valuesByPath(tagPath, (v) => v.value.toPersonNames(v.vr, this.characterSets));
    }
    public personNameByTag(tag: number): PersonName | undefined {
        return this._valueByTag(tag, (v) => v.value.toPersonName(v.vr, this.characterSets));
    }
    public personNameByPath(tagPath: TagPathTag): PersonName | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toPersonName(v.vr, this.characterSets));
    }

    public urlByTag(tag: number): URL | undefined {
        return this._valueByTag(tag, (v) => v.value.toURL(v.vr));
    }
    public urlByPath(tagPath: TagPathTag): LocalTime | undefined {
        return this._valueByPath(tagPath, (v) => v.value.toURL(v.vr));
    }

    public sequenceByTag(tag: number): Sequence | undefined {
        const e = this.elementByTag(tag);
        return e instanceof Sequence ? e : undefined;
    }
    public sequenceByPath(tagPath: TagPathTag): Sequence | undefined {
        const e = this._traverseTrunk(this, tagPath.previous());
        return e ? e.sequenceByTag(tagPath.tag()) : undefined;
    }

    public itemByTag(tag: number, index: number): Item | undefined {
        const s = this.sequenceByTag(tag);
        return s ? s.item(index) : undefined;
    }
    public nestedByTag(tag: number, item: number): Elements | undefined {
        const i = this.itemByTag(tag, item);
        return i ? i.elements : undefined;
    }
    public nestedByPath(tagPath: TagPathItem): Elements | undefined {
        const e = this._traverseTrunk(this, tagPath.previous());
        return e ? e.nestedByTag(tagPath.tag(), tagPath.item) : undefined;
    }

    public fragmentsByTag(tag: number): Fragments | undefined {
        const e = this.elementByTag(tag);
        return e && e instanceof Fragments ? e : undefined;
    }

    public setElementSet(elementSet: ElementSet): Elements {
        if (elementSet instanceof ValueElement && elementSet.tag === Tag.SpecificCharacterSet) {
            return new Elements(
                CharacterSets.fromBytes(elementSet.value.bytes),
                this.zoneOffset,
                this._insertOrdered(elementSet),
            );
        }
        if (elementSet instanceof ValueElement && elementSet.tag === Tag.TimezoneOffsetFromUTC) {
            const newOffset = parseZoneOffset(elementSet.value.toString(VR.SH));
            const zone = newOffset || systemZone;
            return new Elements(this.characterSets, zone, this._insertOrdered(elementSet));
        }
        return new Elements(this.characterSets, this.zoneOffset, this._insertOrdered(elementSet));
    }

    public setElementSets(elementSets: ElementSet[]): Elements {
        return elementSets.reduce((elements, elementSet) => elements.setElementSet(elementSet), this);
    }

    public setSequence(sequence: Sequence): Elements {
        return this.setElementSet(sequence);
    }

    private updateSequence(tag: number, index: number, update: (e: Elements) => Elements): Elements | undefined {
        const s1 = this.sequenceByTag(tag);
        if (s1) {
            const i1 = s1.item(index);
            if (i1) {
                const e1 = i1.elements;
                const e2 = update(e1);
                const i2 = i1.setElements(e2);
                const s2 = s1.setItem(index, i2);
                return this.setElementSet(s2);
            }
        }
        return undefined;
    }

    private updatePath(elems: Elements, tagPath: TagPath[], f: (e: Elements) => Elements): Elements {
        if (tagPath.length === 0) {
            return f(elems);
        }
        const tp = tagPath[0];
        if (tp instanceof TagPathItem) {
            const updated = elems.updateSequence(tp.tag(), tp.item, (e) => this.updatePath(e, tagPath.slice(1), f));
            return updated ? updated : elems;
        }
        throw Error('Unsupported tag path type');
    }

    public setNested(tagPath: TagPathItem, elements: Elements): Elements {
        return this.updatePath(this, tagPath.toList(), () => elements);
    }

    public setNestedElementSet(tagPath: TagPathItem, elementSet: ElementSet): Elements {
        return this.updatePath(this, tagPath.toList(), (elements) => elements.setElementSet(elementSet));
    }

    public setNestedSequence(tagPath: TagPathItem, sequence: Sequence): Elements {
        return this.setNestedElementSet(tagPath, sequence);
    }

    public addItem(tagPath: TagPathSequence, elements: Elements): Elements {
        const sequence = this.sequenceByPath(tagPath);
        if (sequence) {
            const bigEndian = sequence.bigEndian;
            const indeterminate = sequence.indeterminate;
            const item = indeterminate
                ? new Item(elements, indeterminateLength, bigEndian)
                : new Item(elements, elements.toBytes(false).length, bigEndian);
            const updatedSequence = sequence.addItem(item);
            if (tagPath.previous() === emptyTagPath) {
                return this.setSequence(updatedSequence);
            } else if (tagPath.previous() instanceof TagPathItem) {
                return this.setNestedSequence(tagPath.previous() as TagPathItem, updatedSequence);
            }
            throw Error('Unsupported tag path type');
        }
        return this;
    }

    public setCharacterSets(characterSets: CharacterSets): Elements {
        return new Elements(characterSets, this.zoneOffset, this.data);
    }

    public setZoneOffset(zoneOffset: ZoneId): Elements {
        return new Elements(this.characterSets, zoneOffset, this.data);
    }

    public setValue(tag: number, vr: VR, value: Value, bigEndian = false, explicitVR = true): Elements {
        return this.setElementSet(new ValueElement(tag, vr, value, bigEndian, explicitVR));
    }

    public setBytes(tag: number, vr: VR, value: Buffer, bigEndian = false, explicitVR = true): Elements {
        return this.setValue(tag, vr, Value.fromBuffer(vr, value), bigEndian, explicitVR);
    }

    public setStrings(
        tag: number,
        values: string[],
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromStrings(vr, values, bigEndian), bigEndian, explicitVR);
    }

    public setString(
        tag: number,
        value: string,
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromString(vr, value, bigEndian), bigEndian, explicitVR);
    }

    public setNumbers(
        tag: number,
        values: number[],
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromNumbers(vr, values, bigEndian), bigEndian, explicitVR);
    }

    public setNumber(
        tag: number,
        value: number,
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromNumber(vr, value, bigEndian), bigEndian, explicitVR);
    }

    public setDates(
        tag: number,
        values: LocalDate[],
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromDates(vr, values), bigEndian, explicitVR);
    }

    public setDate(
        tag: number,
        value: LocalDate,
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromDate(vr, value), bigEndian, explicitVR);
    }

    public setTimes(
        tag: number,
        values: LocalTime[],
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromTimes(vr, values), bigEndian, explicitVR);
    }

    public setTime(
        tag: number,
        value: LocalTime,
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromTime(vr, value), bigEndian, explicitVR);
    }

    public setDateTimes(
        tag: number,
        values: ZonedDateTime[],
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromDateTimes(vr, values), bigEndian, explicitVR);
    }

    public setDateTime(
        tag: number,
        value: ZonedDateTime,
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromDateTime(vr, value), bigEndian, explicitVR);
    }

    public setPersonNames(
        tag: number,
        values: PersonName[],
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromPersonNames(vr, values), bigEndian, explicitVR);
    }

    public setPersonName(
        tag: number,
        value: PersonName,
        vr: VR = Lookup.vrOf(tag),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setValue(tag, vr, Value.fromPersonName(vr, value), bigEndian, explicitVR);
    }

    public setURL(tag: number, value: URL, vr: VR = Lookup.vrOf(tag), bigEndian = false, explicitVR = true): Elements {
        return this.setValue(tag, vr, Value.fromURL(vr, value), bigEndian, explicitVR);
    }

    public setNestedValue(tagPath: TagPathTag, vr: VR, value: Value, bigEndian = false, explicitVR = true): Elements {
        if (tagPath.isRoot()) {
            return this.setValue(tagPath.tag(), vr, value, bigEndian, explicitVR);
        } else {
            return this.setNested(
                tagPath.previous() as TagPathItem,
                (this.nestedByPath(tagPath.previous() as TagPathItem) || Elements.empty()).setValue(
                    tagPath.tag(),
                    vr,
                    value,
                    bigEndian,
                    explicitVR,
                ),
            );
        }
    }

    public setNestedBytes(tagPath: TagPathTag, vr: VR, value: Buffer, bigEndian = false, explicitVR = true): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromBuffer(vr, value), bigEndian, explicitVR);
    }

    public setNestedStrings(
        tagPath: TagPathTag,
        values: string[],
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromStrings(vr, values, bigEndian), bigEndian, explicitVR);
    }

    public setNestedString(
        tagPath: TagPathTag,
        value: string,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromString(vr, value, bigEndian), bigEndian, explicitVR);
    }

    public setNestedNumbers(
        tagPath: TagPathTag,
        values: number[],
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromNumbers(vr, values, bigEndian), bigEndian, explicitVR);
    }

    public setNestedNumber(
        tagPath: TagPathTag,
        value: number,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromNumber(vr, value, bigEndian), bigEndian, explicitVR);
    }

    public setNestedDates(
        tagPath: TagPathTag,
        values: LocalDate[],
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromDates(vr, values), bigEndian, explicitVR);
    }

    public setNestedDate(
        tagPath: TagPathTag,
        value: LocalDate,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromDate(vr, value), bigEndian, explicitVR);
    }

    public setNestedTimes(
        tagPath: TagPathTag,
        values: LocalTime[],
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromTimes(vr, values), bigEndian, explicitVR);
    }

    public setNestedTime(
        tagPath: TagPathTag,
        value: LocalTime,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromTime(vr, value), bigEndian, explicitVR);
    }

    public setNestedDateTimes(
        tagPath: TagPathTag,
        values: ZonedDateTime[],
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromDateTimes(vr, values), bigEndian, explicitVR);
    }

    public setNestedDateTime(
        tagPath: TagPathTag,
        value: ZonedDateTime,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromDateTime(vr, value), bigEndian, explicitVR);
    }

    public setNestedPersonNames(
        tagPath: TagPathTag,
        values: PersonName[],
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromPersonNames(vr, values), bigEndian, explicitVR);
    }

    public setNestedPersonName(
        tagPath: TagPathTag,
        value: PersonName,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromPersonName(vr, value), bigEndian, explicitVR);
    }

    public setNestedURL(
        tagPath: TagPathTag,
        value: URL,
        vr: VR = Lookup.vrOf(tagPath.tag()),
        bigEndian = false,
        explicitVR = true,
    ): Elements {
        return this.setNestedValue(tagPath, vr, Value.fromURL(vr, value), bigEndian, explicitVR);
    }

    public removeByTag(tag: number): Elements {
        return this.filter((elementSet) => elementSet.tag !== tag);
    }

    public removeByPath(tagPath: TagPath): Elements {
        if (tagPath === emptyTagPath) {
            return this;
        }
        if (tagPath instanceof TagPathItem) {
            if (tagPath.previous() === emptyTagPath) {
                const s = this.sequenceByTag(tagPath.tag());
                return s ? this.setSequence(s.removeItem(tagPath.item)) : this;
            }
            if (tagPath.previous() instanceof TagPathItem) {
                const e = this.nestedByPath(tagPath.previous() as TagPathItem);
                return e
                    ? this.setNested(
                          tagPath.previous() as TagPathItem,
                          e.removeByPath(TagPath.fromItem(tagPath.tag(), tagPath.item)),
                      )
                    : this;
            }
            throw Error('Unsupported tag path type');
        }
        if (tagPath instanceof TagPathTag) {
            if (tagPath.previous() === emptyTagPath) {
                return this.removeByTag(tagPath.tag());
            }
            if (tagPath.previous() instanceof TagPathItem) {
                const e = this.nestedByPath(tagPath.previous() as TagPathItem);
                return e ? this.setNested(tagPath.previous() as TagPathItem, e.removeByTag(tagPath.tag())) : this;
            }
            throw Error('Unsupported tag path type');
        }
        throw Error('Unsupported tag path type');
    }

    public filter(f: (e: ElementSet) => boolean): Elements {
        return new Elements(this.characterSets, this.zoneOffset, this.data.filter(f));
    }

    public head(): ElementSet | undefined {
        return this.data.length > 0 ? this.data[0] : undefined;
    }

    public isEmpty(): boolean {
        return this.data.length <= 0;
    }

    public nonEmpty(): boolean {
        return !this.isEmpty();
    }

    public contains(tag: number | TagPath): boolean {
        return typeof tag === 'number'
            ? this.data.map((e) => e.tag).includes(tag)
            : tag instanceof TagPathTag
            ? this.elementByPath(tag) !== undefined
            : tag instanceof TagPathItem
            ? this.nestedByPath(tag) !== undefined
            : false;
    }

    public sorted(): Elements {
        return new Elements(
            this.characterSets,
            this.zoneOffset,
            this.data.slice().sort((e1, e2) => e1.tag - e2.tag),
        );
    }

    public toElements(withPreamble = true): Element[] {
        const elements = flatten(this.data.map((e) => e.toElements()));
        return withPreamble ? prependToArray(preambleElement, elements) : elements;
    }
    public toParts(withPreamble?: boolean): DicomPart[] {
        return flatten(this.toElements(withPreamble).map((e) => e.toParts()));
    }
    public toBytes(withPreamble = true): Buffer {
        return this.data
            .map((e) => e.toBytes())
            .reduce((p, e) => concat(p, e), withPreamble ? preambleElement.toBytes() : emptyBuffer);
    }
    public toStrings(indent: string): string[] {
        const space = ' ';

        const space1 = (description: string): string => {
            return space.repeat(Math.max(0, 40 - description.length));
        };

        const space2 = (length: number): string => {
            return space.repeat(Math.max(0, 4 - (length + '').length));
        };

        return flatten(
            this.data.map((e) => {
                if (e instanceof ValueElement) {
                    const strings = e.value.toStrings(e.vr, e.bigEndian, this.characterSets);
                    const s = strings.join(multiValueDelimiter);
                    const vm = strings.length + '';
                    return [
                        indent +
                            tagToString(e.tag) +
                            space +
                            e.vr.name +
                            space +
                            s +
                            space +
                            space1(s) +
                            ' # ' +
                            space2(e.length) +
                            space +
                            e.length +
                            ', ' +
                            vm +
                            space +
                            Lookup.keywordOf(e.tag) || '',
                    ];
                }

                if (e instanceof Sequence) {
                    const hDescription =
                        e.length === indeterminateLength
                            ? 'Sequence with indeterminate length'
                            : 'Sequence with explicit length ' + e.length;
                    const heading =
                        indent +
                            tagToString(e.tag) +
                            ' SQ ' +
                            hDescription +
                            space +
                            space1(hDescription) +
                            ' # ' +
                            space2(toInt32(e.length)) +
                            space +
                            toInt32(e.length) +
                            ', 1 ' +
                            Lookup.keywordOf(e.tag) || '';
                    const items = flatten(
                        e.items.map((i) => {
                            const iDescription = i.indeterminate
                                ? 'Item with indeterminate length'
                                : 'Item with explicit length ' + i.length;
                            const itemHeading =
                                indent +
                                '  ' +
                                tagToString(Tag.Item) +
                                ' na ' +
                                iDescription +
                                space +
                                space1(iDescription) +
                                ' # ' +
                                space2(toInt32(i.length)) +
                                space +
                                toInt32(i.length) +
                                ', 1 Item';
                            const elems = i.elements.toStrings(indent + '    ');
                            const itemDelimitation =
                                indent +
                                '  ' +
                                tagToString(Tag.ItemDelimitationItem) +
                                ' na ' +
                                space.repeat(41) +
                                ' #     0, 0 ItemDelimitationItem';
                            elems.unshift(itemHeading);
                            elems.push(itemDelimitation);
                            return elems;
                        }),
                    );
                    const delimitation =
                        indent +
                        tagToString(Tag.SequenceDelimitationItem) +
                        ' na ' +
                        space.repeat(41) +
                        ' #     0, 0 SequenceDelimitationItem';
                    items.unshift(heading);
                    items.push(delimitation);
                    return items;
                }

                if (e instanceof Fragments) {
                    const hDescription = 'Fragments with ' + e.size + ' fragment(s)';
                    const heading =
                        indent +
                            tagToString(e.tag) +
                            space +
                            e.vr.name +
                            space +
                            hDescription +
                            space +
                            space1(hDescription) +
                            ' #    na, 1 ' +
                            Lookup.keywordOf(e.tag) || '';
                    let offsets: string[] = [];
                    if (e.offsets !== undefined) {
                        const len = e.offsets.length;
                        const description = 'Offsets table with ' + len + ' offset(s)';
                        offsets = [
                            indent +
                                space +
                                space +
                                tagToString(Tag.Item) +
                                ' na ' +
                                description +
                                space +
                                space1(description) +
                                ' # ' +
                                space2(len * 4) +
                                space +
                                len * 4 +
                                ', 1 Item',
                        ];
                    }
                    const fragments = e.fragments.map((f) => {
                        const description = 'Fragment with length ' + f.length;
                        return (
                            indent +
                            space +
                            space +
                            tagToString(Tag.Item) +
                            ' na ' +
                            description +
                            space +
                            space1(description) +
                            ' # ' +
                            space2(f.length) +
                            space +
                            f.length +
                            ', 1 Item'
                        );
                    });
                    const delimitation =
                        indent +
                        tagToString(Tag.SequenceDelimitationItem) +
                        ' na ' +
                        space.repeat(43) +
                        ' #     0, 0 SequenceDelimitationItem';
                    offsets.unshift(heading);
                    for (const fragment of fragments) {
                        offsets.push(fragment);
                    }
                    offsets.push(delimitation);
                    return offsets;
                }

                return [];
            }),
        );
    }
    public toString(): string {
        return this.toStrings('').join('\r\n');
    }

    private _valueByTag(tag: number, f: (v: ValueElement) => any): any | undefined {
        const e = this.elementByTag(tag);
        return e && e instanceof ValueElement ? f(e) : undefined;
    }

    private _valueByPath(tagPath: TagPathTag, f: (v: ValueElement) => any): any | undefined {
        const e = this.elementByPath(tagPath);
        return e && e instanceof ValueElement ? f(e) : undefined;
    }

    private _valuesByTag(tag: number, f: (v: ValueElement) => any): any {
        const e = this.elementByTag(tag);
        return e && e instanceof ValueElement ? f(e) : [];
    }

    private _valuesByPath(tagPath: TagPathTag, f: (v: ValueElement) => any): any {
        const e = this.elementByPath(tagPath);
        return e && e instanceof ValueElement ? f(e) : [];
    }

    private _traverseTrunk(elems: Elements, trunk: TagPathTrunk): Elements | undefined {
        if (trunk.isEmpty()) {
            return elems;
        } else {
            if (trunk instanceof TagPathItem) {
                const e = this._traverseTrunk(elems, trunk.previous());
                return e ? e.nestedByTag(trunk.tag(), trunk.item) : undefined;
            }
            throw Error('Unsupported tag path type');
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
