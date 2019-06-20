const base = require("./base");
const VR = require("./vr");
const Tag = require("./tag");
const {CharacterSets} = require("./character-sets");
const {
    ValueElement, Sequence, Fragments, Item, Fragment, FragmentsElement, SequenceDelimitationElement, 
    SequenceElement, ItemElement, ItemDelimitationElement, FragmentElement, Elements
} = require("./elements");

class ElementsBuilder {
    constructor() {
        this._builderStack = [new DatasetBuilder(base.defaultCharacterSet, base.systemZone)];
        this._sequenceStack = [];
        this._lengthStack = [];
        this._fragments = undefined;
    }

    _updateSequence(sequence) {
        if (this._sequenceStack.length === 0)
            this._sequenceStack = [sequence];
        else
            this._sequenceStack[0] = sequence;
    }
    _updateFragments(fragments) { this._fragments = fragments; }
    _subtractLength(length) { this._lengthStack.forEach(l => l.bytesLeft -= length); }
    _pushBuilder(builder) { this._builderStack.unshift(builder); }
    _pushSequence(sequence) { this._sequenceStack.unshift(sequence); }
    _pushLength(element, length) { this._lengthStack.unshift({ element: element, bytesLeft: length }); }
    _popBuilder() { this._builderStack.shift(); }
    _popSequence() { this._sequenceStack.shift(); }
    _popLength() { this._lengthStack.shift(); }
    _hasSequence() { return this._sequenceStack.length > 0; }
    _hasFragments() { return this._fragments !== undefined; }
    _endItem() {
        let builder = this._builderStack[0];
        let sequence = this._sequenceStack[0];
        let elements = builder.result();
        let items = sequence.items;
        if (items.length > 0) {
            items[items.length - 1] = items[items.length - 1].setElements(elements);
            let updatedSequence = new Sequence(sequence.tag, sequence.length, items, sequence.bigEndian, sequence.explicitVR);
            this._popBuilder();
            this._updateSequence(updatedSequence);
        }
    }
    _endSequence() {
        let sequence = this._sequenceStack[0];
        let builder = this._builderStack[0];
        builder.addElementSet(sequence);
        this._popSequence();
    }
    _maybeDelimit() {
        const delimits = this._lengthStack
            .filter(e => e.bytesLeft <= 0)
        if (delimits.length > 0) {
            this._lengthStack = this._lengthStack.filter(e => e.bytesLeft > 0);
        delimits
            .forEach(e => {
                if (e.element instanceof ItemElement)
                    this._endItem();
                else
                    this._endSequence();
            });
        }
    }

    addElement(element) {
        if (element instanceof ValueElement) {
            this._subtractLength(element.length + element.vr.headerLength);
            let builder = this._builderStack[0];
            builder.addElementSet(element);
            this._maybeDelimit();
        }

        else if (element instanceof FragmentsElement) {
            this._subtractLength(element.vr.headerLength);
            this._updateFragments(new Fragments(element.tag, element.vr, undefined, [], element.bigEndian, element.explicitVR));
            this._maybeDelimit();
        }

        else if (element instanceof FragmentElement) {
            this._subtractLength(8 + element.length);
            if (this._fragments !== undefined) {
                let updatedFragments = this._fragments.addFragment(new Fragment(element.length, element.value, element.bigEndian));
                this._updateFragments(updatedFragments);
            }
            this._maybeDelimit();
        }

        else if (element instanceof SequenceDelimitationElement && this._hasFragments()) {
            this._subtractLength(8);
            let builder = this._builderStack[0];
            builder.addElementSet(this._fragments);
            this._updateFragments(undefined);
            this._maybeDelimit();
        }

        else if (element instanceof SequenceElement) {
            this._subtractLength(12);
            if (!element.indeterminate)
                this._pushLength(element, element.length);
            this._pushSequence(new Sequence(element.tag, element.length, [], element.bigEndian, element.explicitVR));
            this._maybeDelimit();
        }

        else if (element instanceof ItemElement && this._hasSequence()) {
            this._subtractLength(8);
            let builder = this._builderStack[0];
            let sequence = this._sequenceStack[0].addItem(new Item(Elements.empty(), element.length, element.bigEndian));
            if (!element.indeterminate)
                this._pushLength(element, element.length);
            this._pushBuilder(new DatasetBuilder(builder.characterSets, builder.zoneOffset));
            this._updateSequence(sequence);
            this._maybeDelimit();
        }

        else if (element instanceof ItemDelimitationElement && this._hasSequence()) {
            this._subtractLength(8);
            this._endItem();
            this._maybeDelimit();
        }

        else if (element instanceof SequenceDelimitationElement && this._hasSequence()) {
            this._subtractLength(8);
            this._endSequence();
            this._maybeDelimit();
        }
    }

    currentDepth() {
        return this._sequenceStack.length;
    }

    result() {
        return this._builderStack.length === 0 ? Elements.empty() : this._builderStack[0].result();
    }
}

class DatasetBuilder {
    constructor(characterSets, zoneOffset) {
        this.characterSets = characterSets;
        this.zoneOffset = zoneOffset;
        this.data = new Array(64);
        this.pos = 0;
    }

    addElementSet(elementSet) {
        if (elementSet instanceof ValueElement && elementSet.tag === Tag.SpecificCharacterSet)
            this.characterSets = CharacterSets.fromBytes(elementSet.value.bytes);
        else if (elementSet instanceof ValueElement && elementSet.tag === Tag.TimezoneOffsetFromUTC) {
            let newOffset = parseZoneOffset(elementSet.value.toSingleString(VR.SH, elementSet.bigEndian, this.characterSets));
            this.zoneOffset = isNaN(newOffset) ? this.zoneOffset : newOffset;
        }

        if (this.data.length <= this.pos)
            this.data.length *=2;
        this.data[this.pos++] = elementSet;

        return this;
    }

    result() { return new Elements(this.characterSets, this.zoneOffset, this.data.slice(0, this.pos)); }
}

module.exports = {
    ElementsBuilder: ElementsBuilder
};
