const base = require("./base");
const dictionary = require("./dictionary");
const parts = require("./parts");
const VR = require("./vr");
const Tag = require("./tag");
const TagPath = require("./tag-path");
const Value = require("./value");
const CharacterSets = require("./character-sets");

// TODO support for types other than string, support for setters and remove

class Elements {
    constructor(characterSets, zoneOffset, data) {
        this.characterSets = characterSets;
        this.zoneOffset = zoneOffset;
        this.data = data;
    }

    elementByTag(tag) { return this.data.find(e => e.tag === tag); }

    elementByPath(tagPath) {
        let tp = tagPath.previous();
        if (tp instanceof TagPath.TagPathItem) {
            let e = this.nestedByPath(tp);
            return e === undefined ? undefined : e.elementByTag(tagPath.tag());
        }
        if (tp.isEmpty()) return this.elementByTag(tagPath.tag());
        throw Error("Unsupported tag path type");
    }

    _valueByTag(tag, f) {
        let e = this.elementByTag(tag);
        return (e && e instanceof ValueElement) ? f(e) : undefined;
    }

    _valueByPath(tagPath, f) {
        let e = this.elementByPath(tagPath);
        return (e && e instanceof ValueElement) ? f(e) : undefined;
    }

    _valuesByTag(tag, f) {
        let e = this.elementByTag(tag);
        return (e && e instanceof ValueElement) ? f(e) : [];
    }

    _valuesByPath(tagPath, f) {
        let e = this.elementByPath(tagPath);
        return (e && e instanceof ValueElement) ? f(e) : [];
    }

    valueElementByTag(tag) { return this._valueByTag(tag, f => f); }
    valueElementByPath(tagPath) { return this._valueByPath(tagPath, f => f); }
    valueByTag(tag) {
        let e = this.valueElementByTag(tag);
        return e ? e.value : undefined;
    }
    valueByPath(tagPath) {
        let e = this.valueElementByPath(tagPath);
        return e ? e.value : undefined;
    }
    bytesByTag(tag) {
        let e = this.valueByTag(tag);
        return e ? e.bytes : undefined;
    }
    bytesByPath(tagPath) {
        let e = this.valueByPath(tagPath);
        return e ? e.bytes : undefined;
    }
    stringsByTag(tag) { return this._valuesByTag(tag, v => v.value.toStrings(v.vr, v.bigEndian, this.characterSets)); }
    stringsByPath(tagPath) { return this._valuesByPath(tagPath, v => v.value.toStrings(v.vr, v.bigEndian, this.characterSets)); }
    singleStringByTag(tag) { return this._valueByTag(tag, v => v.value.toSingleString(v.vr, v.bigEndian, this.characterSets)); }
    singleStringByPath(tagPath) { return this._valueByPath(tagPath, v => v.value.toSingleString(v.vr, v.bigEndian, this.characterSets)); }

    _traverseTrunk(elems, trunk) {
        if (trunk.isEmpty())
            return elems;
        else {
            if (trunk instanceof TagPath.TagPathItem) {
                let e = this._traverseTrunk(elems, trunk.previous());
                return e ? e.nestedByTag(trunk.tag(), trunk.item) : undefined;
            }
            throw new Error("Unsupported tag path type");
        }
    }

    sequenceByTag(tag) {
        let e = this.elementByTag(tag);
        return e instanceof Sequence ? e : undefined;
    }
    sequenceByPath(tagPath) {
        let e = this._traverseTrunk(this, tagPath.previous());
        return e ? e.sequenceByTag(tagPath.tag()) : undefined;
    }

    itemByTag(tag, index) {
        let s = this.sequenceByTag(tag);
        return s ? s.item(index) : undefined;
    }
    nestedByTag(tag, item) {
        let i = this.itemByTag(tag, item);
        return i ? i.elements : undefined;
    }
    nestedByPath(tagPath) {
        let e = this._traverseTrunk(this, tagPath.previous());
        return e ? e.nestedByTag(tagPath.tag(), tagPath.item) : undefined;
    }

    fragmentsByTag(tag) {
        let e = this.elementByTag(tag);
        return e && e instanceof Fragments ? e : undefined;
    }

    filter(f) { return new Elements(this.characterSets, this.zoneOffset, this.data.filter(f)); }

    head() { return this.data.length > 0 ? this.data[0] : undefined; }

    size() { return this.data.length; }

    isEmpty() { return this.data.length <= 0; }

    nonEmpty() { return !this.isEmpty(); }

    contains(tag) {
        return typeof tag === "number" ? this.data.map(e => e.tag).includes(tag) :
            tag instanceof TagPath.TagPathTag ? this.elementByPath(tag) !== undefined :
            tag instanceof TagPath.TagPathItem ? this.nestedByPath(tag) !== undefined : false;
    }

    sorted() { return new Elements(this.characterSets, this.zoneOffset, this.data.slice().sort((e1, e2) => e1.tag - e2.tag)); }

    toElements() { return base.flatten(this.data.map(e => e.toElements())); }
    toParts() { return base.flatten(this.toElements().map(e => e.toParts())) }
    toBytes(withPreamble) {
        withPreamble = withPreamble === undefined ? true : withPreamble;
        return this.data
            .map(e => e.toBytes())
            .reduce((p, e) => base.concat(p, e), withPreamble ? preambleElement.toBytes() : base.emptyBuffer);
    }
    toStrings(indent) {
        let space = " ";

        let space1 = function(description) {
            return space.repeat(Math.max(0, 40 - description.length));
        };

        let space2 = function(length) {
            return space.repeat(Math.max(0, 4 - (length + "").length));
        };

        return base.flatten(this.data.map(e => {
            if (e instanceof ValueElement) {
                let strings = e.value.toStrings(e.vr, e.bigEndian, this.characterSets);
                let s = strings.join(base.multiValueDelimiter);
                let vm = strings.length + "";
                return [indent + base.tagToString(e.tag) + space + e.vr.name + space + s + space + space1(s) + " # " + space2(e.length) + space + e.length + ", " + vm + space + dictionary.keywordOf(e.tag)];
            }

            if (e instanceof Sequence) {
                let hDescription = e.length === base.indeterminateLength ? "Sequence with indeterminate length" : "Sequence with explicit length " + e.length;
                let heading = indent + base.tagToString(e.tag) + " SQ " + hDescription + space + space1(hDescription) + " # " + space2(base.toInt32(e.length)) + space + base.toInt32(e.length) + ", 1 " + dictionary.keywordOf(e.tag);
                let items = base.flatten(e.items.map(i => {
                    let iDescription = i.indeterminate ? "Item with indeterminate length" : "Item with explicit length " + i.length;
                    let heading = indent + "  " + base.tagToString(Tag.Item) + " na " + iDescription + space + space1(iDescription) + " # " + space2(base.toInt32(i.length)) + space + base.toInt32(i.length) + ", 1 Item";
                    let elems = i.elements.toStrings(indent + "    ");
                    let delimitation = indent + "  " + base.tagToString(Tag.ItemDelimitationItem) + " na " + space.repeat(41) + " #     0, 0 ItemDelimitationItem" + (i.indeterminate ? "" : " (marker)");
                    elems.unshift(heading);
                    elems.push(delimitation);
                    return elems;
                }));
                let delimitation = indent + base.tagToString(Tag.SequenceDelimitationItem) + " na " + space.repeat(41) + " #     0, 0 SequenceDelimitationItem" + (e.indeterminate ? "" : " (marker)");
                items.unshift(heading);
                items.push(delimitation);
                return items;
            }

            if (e instanceof Fragments) {
                let hDescription = "Fragments with " + e.length + " fragment(s)";
                let heading = indent + base.tagToString(e.tag) + space + e.vr.name + space + hDescription + space + space1(hDescription) + " #    na, 1 " + dictionary.keywordOf(e.tag);
                let offsets = e.offsets.map(o => {
                    let description = "Offsets table with " + o.length + " offset(s)";
                    return [indent + space + space + base.tagToString(Tag.Item) + " na " + description + space + space1(description) + " # " + space2(o.length * 4) + space + o.length * 4 + ", 1 Item"]
                });
                offsets = offsets ? offsets : [];
                let fragments = e.fragments.map(f => {
                    let description = "Fragment with length " + f.length;
                    return indent + space + space + base.tagToString(Tag.Item) + " na " + description + space + space1(description) + " # " + space2(f.length) + space + f.length + ", 1 Item";
                });
                let delimitation = indent + base.tagToString(Tag.SequenceDelimitationItem) + " na " + space.repeat(43) + " #     0, 0 SequenceDelimitationItem";
                offsets.unshift(heading);
                for (let i = 0; i < fragments.length; i++)
                    offsets.push(fragments[i]);
                offsets.push(delimitation);
                return offsets;
            }

            return [];
        }));
    }
    toString() {
        return this.toStrings("").join("\r\n");
    }

}

class Element {
    constructor(bigEndian) {
        this.bigEndian = bigEndian === undefined ? false : bigEndian;
    }

    toBytes() { return base.emptyBuffer; }
    toParts() { return []; }
}

class ElementSet {
    constructor(tag, vr, bigEndian, explicitVR) {
        this.tag = tag;
        this.vr = vr;
        this.bigEndian = bigEndian === undefined ? false : bigEndian;
        this.explicitVR = explicitVR === undefined ? true : explicitVR;
    }

    toBytes() { return base.emptyBuffer; }
    toElements() { return []; }
}

const preambleElement = new class extends Element {
    constructor() {
        super(false);
    }
    toBytes() { return base.concat(Buffer.from(new Array(128).fill(0)), Buffer.from("DICM")); }
    toString() { return "PreambleElement(0, ..., 0, D, I, C, M)"; }
    toParts() { return [new parts.PreamblePart(this.toBytes())]; }
}();

class ValueElement extends ElementSet {
    constructor(tag, vr, value, bigEndian, explicitVR) {
        super(tag, vr, bigEndian, explicitVR);
        this.value = value;
        this.length = value.length;
    }

    setValue(value) { return new ValueElement(this.tag, this.vr, value.ensurePadding(this.vr), this.bigEndian, this.explicitVR); }
    toBytes() { return this.toParts().map(p => p.bytes).reduce(base.concat); }
    toParts() { return [new parts.HeaderPart(this.tag, this.vr, this.length, base.isFileMetaInformation(this.tag), this.bigEndian, this.explicitVR), new parts.ValueChunk(this.bigEndian, this.value.bytes, true)]; }
    toElements() { return [this]; }
    toString() {
        let strings = this.value.toStrings(this.vr, this.bigEndian, base.defaultCharacterSet);
        let s = strings.join(base.multiValueDelimiter);
        let vm = strings.length + "";
        return "ValueElement(" + base.tagToString(this.tag) + " " + this.vr.name + " [" + s + "] # " + this.length + ", " + vm + " " + dictionary.keywordOf(this.tag) + ")";
    }
}

class SequenceElement extends Element {
    constructor(tag, length, bigEndian, explicitVR) {
        super(bigEndian);
        this.tag = tag;
        this.length = length === undefined ? base.indeterminateLength : length;
        this.explicitVR = explicitVR === undefined ? true : explicitVR;
    }

    toBytes() { return new parts.HeaderPart(this.tag, VR.SQ, this.length, false, this.bigEndian, this.explicitVR).bytes; }
    toParts() { return [new parts.SequencePart(this.tag, this.length, this.bigEndian, this.explicitVR, this.toBytes())]; }
    toString() { return "SequenceElement(" + base.tagToString(this.tag) + " SQ # " + this.length + " " + dictionary.keywordOf(this.tag) + ")"; }
}

class FragmentsElement extends Element {
    constructor(tag, vr, bigEndian, explicitVR) {
        super(bigEndian);
        this.tag = tag;
        this.vr = vr;
        this.explicitVR = explicitVR === undefined ? true : explicitVR;
    }

    toBytes() { return this.toParts()[0].bytes; }
    toParts() { return [new parts.HeaderPart(this.tag, this.vr, base.indeterminateLength, false, this.bigEndian, this.explicitVR)]; }
    toString() { return "FragmentsElement(" + base.tagToString(this.tag) + " " + this.vr.name + " # " + dictionary.keywordOf(this.tag) + ")"; }
}

class FragmentElement extends Element {
    constructor(index, length, value, bigEndian) {
        super(bigEndian);
        this.index = index;
        this.length = length;
        this.value = value;
    }

    toBytes() { return this.toParts().map(p => p.bytes).reduce(base.concat); }
    toParts() {
        let itemParts = new ItemElement(this.index, this.value.length, this.bigEndian).toParts();
        itemParts.push(new parts.ValueChunk(this.bigEndian, this.value.bytes, true));
        return itemParts;
    }
    toString() { return "FragmentElement(index = " + this.index + ", length = " + this.length + ")"; }
}

class ItemElement extends Element {
    constructor(index, length, bigEndian) {
        super(bigEndian);
        this.index = index;
        this.length = length === undefined ? base.indeterminateLength : length;
    }

    toBytes() { return base.concat(base.tagToBytes(Tag.Item, this.bigEndian), base.intToBytes(this.length, this.bigEndian)); }
    toParts() { return [new parts.ItemPart(this.index, this.length, this.bigEndian, this.toBytes())]; }
    toString() { return "ItemElement(index = " + this.index + ", length = " + this.length + ")"; }
}

class ItemDelimitationElement extends Element {
    constructor(index, marker, bigEndian) {
        super(bigEndian);
        this.index = index;
        this.marker = marker;
        this.bigEndian = bigEndian;
    }

    toBytes() { return this.marker ? base.emptyBuffer : base.concat(base.tagToBytes(Tag.ItemDelimitationItem, this.bigEndian), Buffer.from([0, 0, 0, 0])); }
    toParts() { return this.marker ? [] : [new parts.ItemDelimitationPart(this.index, this.bigEndian, this.toBytes())]; }
    toString() { return "ItemDelimitationElement(index = " + this.index + ", marker = " + this.marker + ")"; }
}

class SequenceDelimitationElement extends Element {
    constructor(marker, bigEndian) {
        super(bigEndian);
        this.marker = marker;
    }

    toBytes() { return this.marker ? base.emptyBuffer : base.concat(base.tagToBytes(Tag.SequenceDelimitationItem, this.bigEndian), Buffer.from([0, 0, 0, 0])); }
    toParts() { return this.marker ? [] : [new parts.SequenceDelimitationPart(this.bigEndian, this.toBytes())]; }
    toString() { return "SequenceDelimitationElement(marker = " + this.marker + ")"; }
}

class Sequence extends ElementSet {
    constructor(tag, length, items, bigEndian, explicitVR) {
        super(tag, VR.SQ, bigEndian, explicitVR);
        this.length = length === undefined ? base.indeterminateLength : length;
        this.items = items === undefined ? [] : items;
        this.indeterminate = this.length === base.indeterminateLength;
    }

    item(index) { return this.items.length >= index ? this.items[index - 1] : undefined; }
    addItem(item) {
        let newItems = base.appendToArray(item, this.items);
        let newLength = this.indeterminate ? this.length : this.length + item.toBytes().length;
        return new Sequence(this.tag, newLength, newItems, this.bigEndian, this.explicitVR);
    }
    removeItem(index) {
        let newItems = this.items.slice();
        newItems.splice(index - 1, 1);
        let newLength = this.indeterminate ? this.length : this.length - this.item(index).toBytes().length;
        return new Sequence(this.tag, newLength, newItems, this.bigEndian, this.explicitVR);
    }
    toBytes() { return this.toElements().map(e => e.toBytes()).reduce(base.concat, base.emptyBuffer); }
    toElements() {
        let elements = [];
        elements.push(new SequenceElement(this.tag, this.length, this.bigEndian, this.explicitVR));
        for (let i = 1; i <= this.items.length; i++) {
            let itemElements = this.item(i).toElements(i);
            itemElements.forEach(e => elements.push(e));
        }
        elements.push(new SequenceDelimitationElement(!this.indeterminate, this.bigEndian));
        return elements;
    }
    size() { return this.items.length; }
    setItem(index, item) {
        let newItems = this.items.slice();
        newItems[index - 1] = item;
        return new Sequence(this.tag, this.length, newItems, this.bigEndian, this.explicitVR);
    }
    toString() { return "Sequence(" + base.tagToString(this.tag) + " SQ # " + this.length + " " + this.size() + " " + dictionary.keywordOf(this.tag) + ")"; }
}

class Item {
    constructor(elements, length, bigEndian) {
        this.elements = elements;
        this.length = length === undefined ? base.indeterminateLength : length;
        this.bigEndian = bigEndian === undefined ? false : bigEndian;
        this.indeterminate = this.length === base.indeterminateLength;
    }

    toElements(index) {
        let elements = [];
        elements.push(new ItemElement(index, this.length, this.bigEndian));
        this.elements.toElements().forEach(e => elements.push(e));
        elements.push(new ItemDelimitationElement(index, !this.indeterminate, this.bigEndian));
        return elements;
    }
    toBytes() { return this.toElements(1).map(e => e.toBytes()).reduce(base.concat); }
    setElements(elements) {
        let newLength = this.indeterminate ? base.indeterminateLength : elements.toBytes(false).length;
        return new Item(elements, newLength, this.bigEndian);
    }
    toString() { return "Item(length = " + this.length + ", elements size = " + this.elements.size + ")"; }
}

class Fragment {
    constructor(length, value, bigEndian) {
        this.length = length;
        this.value = value;
        this.bigEndian = bigEndian === undefined ? false : bigEndian;
    }

    toElement(index) { return new FragmentElement(index, this.length, this.value, this.bigEndian); }
    toString() { return "Fragment(length = " + this.length + ", value length = " + this.value.length + ")"; }
}

class Fragments extends ElementSet {
    constructor(tag, vr, offsets, fragments, bigEndian, explicitVR) {
        super(tag, vr, bigEndian, explicitVR);
        this.offsets = offsets;
        this.fragments = fragments;
    }

    fragment(index) { return this.fragments.length > index ? undefined : this.fragments[index - 1]; }
    frameCount() { return this.offsets === undefined && this.fragments.length === 0 ? 0 : this.offsets === undefined ?  1 : this.offsets.size; }
    addFragment(fragment) {
        if (this.fragments.length === 0 && this.offsets === undefined) {
            let bytes = fragment.value.bytes;
            let offsets = [];
            for (let i = 0; i < bytes.length; i += 4) {
                offsets.push(base.bytesToUInt(bytes, fragment.bigEndian));
            }
            return new Fragments(this.tag, this.vr, offsets, this.fragments, this.bigEndian, this.explicitVR);
        } else
            return new Fragments(this.tag, this.vr, this.offsets, base.appendToArray(fragment, this.fragments), this.bigEndian, this.explicitVR);
    }
    toBytes() { return this.toElements().map(e => e.toBytes()).reduce(base.concat); }
    size() { return this.fragments.length; }
    toElements() {
        let elements = [];
        elements.push(new FragmentsElement(this.tag, this.vr, this.bigEndian, this.explicitVR));
        if (this.offsets !== undefined)
            elements.push(new FragmentElement(1, 4 * this.offsets.length, Value.create(this.offsets.map(offset => base.longToBytes(offset, this.bigEndian).slice(0, 4), this.bigEndian).reduce(base.concat, base.emptyBuffer), this.bigEndian)));
        for (let i = 1; i <= this.fragments.length; i++) {
            elements.push(this.fragment(i).toElement(i + 1));
        }
        elements.push(new SequenceDelimitationElement(this.bigEndian));
        return elements;
    }
    setFragment(index, fragment) {
        let newFragments = this.fragments.slice();
        newFragments[index - 1] = fragment;
        return new Fragments(this.tag, this.vr, this.offsets, newFragments, this.bigEndian, this.explicitVR);
    }
    toString() { return "Fragments(" + base.tagToString(this.tag) + " " + this.vr.name + " # " + this.fragments.length + " " + dictionary.keywordOf(this.tag) + ")"; }
}

class ElementsBuilder {
    constructor(characterSets, zoneOffset) {
        this.characterSets = characterSets;
        this.zoneOffset = zoneOffset;
        this.data = [];
    }

    parseZoneOffset(s) {
        if (s.length < 5) return NaN;
        return parseInt(s.slice(0, 1) + (parseInt(s.slice(1,3)) * 60 + parseInt(s.slice(3, 5))));
    }

    addElement(element) {
        if (element instanceof ValueElement && element.tag === Tag.SpecificCharacterSet)
            this.characterSets = CharacterSets.fromBytes(element.value.toBytes());
        if (element instanceof ValueElement && element.tag === Tag.TimezoneOffsetFromUTC) {
            let newOffset = this.parseZoneOffset(element.value.toSingleString(VR.SH, element.bigEndian, this.characterSets));
            this.zoneOffset = isNaN(newOffset) ? this.zoneOffset : newOffset;
        }
        this.data.push(element);
        return this;
    }
    result() { return new Elements(this.characterSets, this.zoneOffset, data); }
    toString() { return "ElementsBuilder(characterSets = " + this.characterSets + ", zoneOffset = " + this.zoneOffset + ", size = " + this.data.size + ")"; }
}

module.exports = {
    Elements: Elements,
    Element: Element,
    ElementSet: ElementSet,
    preambleElement: preambleElement,
    ValueElement: ValueElement,
    SequenceElement: SequenceElement,
    FragmentElement: FragmentElement,
    FragmentsElement: FragmentsElement,
    ItemElement: ItemElement,
    ItemDelimitationElement: ItemDelimitationElement,
    SequenceDelimitationElement: SequenceDelimitationElement,
    Sequence: Sequence,
    Item: Item,
    Fragment: Fragment,
    Fragments: Fragments
};
