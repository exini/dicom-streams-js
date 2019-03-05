const {Writable} = require("readable-stream");
const base = require("./base");
const {Elements, ElementsBuilder, ValueElement, FragmentsElement, FragmentElement, SequenceElement, SequenceDelimitationElement, ItemElement, ItemDelimitationElement, Sequence, Item, Fragment, Fragments} = require("./elements");

class ElementSinkData {
    constructor(builderStack, sequenceStack, fragments) {
        this.builderStack = builderStack === undefined ? [new ElementsBuilder(base.defaultCharacterSet, base.systemZone)] : builderStack;
        this.sequenceStack = sequenceStack === undefined ? [] : sequenceStack;
        this.fragments = fragments;
    }

    updateSequence(sequence) {
        if (this.sequenceStack.length === 0)
            this.sequenceStack = [sequence];
        else
            this.sequenceStack[0] = sequence;
    }
    updateFragments(fragments) { this.fragments = fragments; }
    pushBuilder(builder) { this.builderStack.unshift(builder); }
    pushSequence(sequence) { this.sequenceStack.unshift(sequence); }
    popBuilder() { this.builderStack.shift(); }
    popSequence() { this.sequenceStack.shift(); }
    hasSequence() { return this.sequenceStack.length > 0; }
    hasFragments() { return this.fragments !== undefined; }
}

function elementSink(callback) {
    let sinkData = new ElementSinkData();
    let sink = new Writable({
        objectMode: true,
        write(element, encoding, cb) {

            if (element instanceof ValueElement) {
                let builder = sinkData.builderStack[0];
                builder.addElement(element);
            }

            if (element instanceof FragmentsElement)
                sinkData.updateFragments(new Fragments(element.tag, element.vr, undefined, [], element.bigEndian, element.explicitVR));

            if (element instanceof FragmentElement)
                if (sinkData.fragments !== undefined) {
                    let updatedFragments = sinkData.fragments.addFragment(new Fragment(element.length, element.value, element.bigEndian));
                    sinkData.updateFragments(updatedFragments);
                }

            if (element instanceof SequenceDelimitationElement && sinkData.hasFragments()) {
                let fragments = sinkData.fragments;
                let builder = sinkData.builderStack[0];
                builder.addElement(fragments);
                sinkData.updateFragments(undefined);
            }

            if (element instanceof SequenceElement)
                sinkData.pushSequence(new Sequence(element.tag, element.length, [], element.bigEndian, element.explicitVR));

            if (element instanceof ItemElement && sinkData.hasSequence()) {
                let builder = sinkData.builderStack[0];
                let sequence = sinkData.sequenceStack[0].addItem(new Item(Elements.empty(), element.length, element.bigEndian));
                sinkData.pushBuilder(new ElementsBuilder(builder.characterSets, builder.zoneOffset));
                sinkData.updateSequence(sequence);
            }

            if (element instanceof ItemDelimitationElement && sinkData.hasSequence()) {
                let builder = sinkData.builderStack[0];
                let sequence = sinkData.sequenceStack[0];
                let elements = builder.result();
                let items = sequence.items;
                if (items.length > 0) {
                    items[items.length - 1] = items[items.length - 1].setElements(elements);
                    let updatedSequence = new Sequence(sequence.tag, sequence.length, items, sequence.bigEndian, sequence.explicitVR);
                    sinkData.popBuilder();
                    sinkData.updateSequence(updatedSequence);
                }
            }

            if (element instanceof SequenceDelimitationElement && sinkData.hasSequence()) {
                let sequence = sinkData.sequenceStack[0];
                let builder = sinkData.builderStack[0];
                builder.addElement(sequence);
                sinkData.popSequence();
            }

            cb();
        }
    });
    sink.once("finish", () => {
        let builders = sinkData.builderStack;
        let elements = builders.length === 0 ? Elements.empty() : builders[0].result();
        callback(elements);
    });
    return sink;
}

module.exports = {
    elementSink: elementSink
};
