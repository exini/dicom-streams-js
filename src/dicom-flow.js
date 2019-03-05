const Trait = require("traits.js");
const base = require("./base");
const flows = require("./flows");
const {PreamblePart, HeaderPart, ValueChunk, SequencePart, SequenceDelimitationPart, FragmentsPart, ItemPart,
    ItemDelimitationPart, DeflatedChunk, UnknownPart, MetaPart} = require("./parts");
const {emptyTagPath, TagPathItem} = require("./tag-path");
const pipe = require("multipipe");

const flowModel = function (resolutions, impl, base, ...capabilities) {
    let parent = capabilities.reduce((out, cap) => Trait.compose(cap(out)), base);
    return Trait.compose(Trait.resolve(resolutions, parent), Trait(impl));
};

const toFlow = function (model) {
    let flow = Trait.create(Object.prototype, model);
    return pipe(flow.baseFlow(), flows.mapConcatFlow(flow.handlePart));
};

const flow = function (resolutions, impl, base, ...capabilities) {
    return toFlow(flowModel(resolutions, impl, base, ...capabilities));
};

const DicomFlow = Trait({
     onPreamble: Trait.required,
     onHeader: Trait.required,
     onValueChunk: Trait.required,
     onSequence: Trait.required,
     onSequenceDelimitation: Trait.required,
     onFragments: Trait.required,
     onItem: Trait.required,
     onItemDelimitation: Trait.required,
     onDeflatedChunk: Trait.required,
     onUnknown: Trait.required,
     onPart: Trait.required,
     baseFlow: function () { return flows.identityFlow(true); },
     handlePart: function (part) {
        if (part instanceof PreamblePart) return this.onPreamble(part);
        if (part instanceof HeaderPart) return this.onHeader(part);
        if (part instanceof ValueChunk) return this.onValueChunk(part);
        if (part instanceof SequencePart) return this.onSequence(part);
        if (part instanceof SequenceDelimitationPart) return this.onSequenceDelimitation(part);
        if (part instanceof FragmentsPart) return this.onFragments(part);
        if (part instanceof ItemPart) return this.onItem(part);
        if (part instanceof ItemDelimitationPart) return this.onItemDelimitation(part);
        if (part instanceof DeflatedChunk) return this.onDeflatedChunk(part);
        if (part instanceof UnknownPart) return this.onUnknown(part);
        return this.onPart(part);
    }
});

const IdentityFlow = Trait.compose(
    DicomFlow,
    Trait({
        onPreamble: function(part) { return [part]; },
        onHeader: function(part) { return [part]; },
        onValueChunk: function(part) { return [part]; },
        onSequence: function(part) { return [part]; },
        onSequenceDelimitation: function(part) { return [part]; },
        onFragments: function(part) { return [part]; },
        onItem: function(part) { return [part]; },
        onItemDelimitation: function(part) { return [part]; },
        onDeflatedChunk: function(part) { return [part]; },
        onUnknown: function(part) { return [part]; },
        onPart: function(part) { return [part]; }
    }));

const DeferToPartFlow = Trait.compose(
    DicomFlow,
    Trait({
        onPreamble: function(part) { return this.onPart(part); },
        onHeader: function(part) { return this.onPart(part); },
        onValueChunk: function(part) { return this.onPart(part); },
        onSequence: function(part) { return this.onPart(part); },
        onSequenceDelimitation: function(part) { return this.onPart(part); },
        onFragments: function(part) { return this.onPart(part); },
        onDeflatedChunk: function(part) { return this.onPart(part); },
        onUnknown: function(part) { return this.onPart(part); },
        onItem: function(part) { return this.onPart(part); },
        onItemDelimitation: function(part) { return this.onPart(part); }
    }));

class DicomStartMarker extends MetaPart {
    toString() {
        return "Start Marker []";
    }
}
const dicomStartMarker = new DicomStartMarker();

const StartEvent = function(SuperFlow) {
    return flowModel({
        baseFlow: "startEvent_baseFlow",
        handlePart: "startEvent_handlePart"
    }, {
        onStart: Trait.required,
        baseFlow: function() { return pipe(flows.prependFlow(dicomStartMarker, true), this.startEvent_baseFlow()); },
        handlePart: function(part) { return part === dicomStartMarker ? this.onStart() : this.startEvent_handlePart(part); }
    }, SuperFlow);
};

class DicomEndMarker extends MetaPart {
    toString() {
        return "End Marker []";
    }
}
const dicomEndMarker = new DicomEndMarker();

const EndEvent = function(SuperFlow) {
    return flowModel({
        baseFlow: "endEvent_baseFlow",
        handlePart: "endEvent_handlePart"
    }, {
        onEnd: Trait.required,
        baseFlow: function() { return pipe(flows.appendFlow(dicomEndMarker, true), this.endEvent_baseFlow()); },
        handlePart: function(part) { return part === dicomEndMarker ? this.onEnd() : this.endEvent_handlePart(part); }
    }, SuperFlow);
};

const InFragments = function(SuperFlow) {
    return flowModel({
        onFragments: "inFragments_onFragments",
        onSequenceDelimitation: "inFragments_onSequenceDelimitation"
    }, {
        _inFragments: { value: false },
        inFragments: function() { return this._inFragments.value; },
        onFragments: function (part) {
            this._inFragments.value = true;
            return this.inFragments_onFragments(part);
        },
        onSequenceDelimitation: function (part) {
            this._inFragments.value = false;
            return this.inFragments_onSequenceDelimitation(part);
        }
    }, SuperFlow);
};

class ValueChunkMarker extends ValueChunk {
    constructor() {
        super(false, base.emptyBuffer, true);
    }

    toString() {
        return "Value Chunk Marker []";
    }
}
const valueChunkMarker = new ValueChunkMarker();

const GuaranteedValueEvent = function(SuperFlow) {
    return flowModel({
        onHeader: "guaranteedValueEvent_onHeader",
        onItem: "guaranteedValueEvent_onItem",
        onValueChunk: "guaranteedValueEvent_onValueChunk"
    }, {
        onHeader: function(part) { return part.length === 0 ? this.guaranteedValueEvent_onHeader(part).concat(this.onValueChunk(valueChunkMarker)) : this.guaranteedValueEvent_onHeader(part); },
        onItem: function(part) { return this.inFragments() && part.length === 0 ? this.guaranteedValueEvent_onItem(part).concat(this.onValueChunk(valueChunkMarker)) : this.guaranteedValueEvent_onItem(part); },
        onValueChunk: function(part) { return this.guaranteedValueEvent_onValueChunk(part).filter(c => c !== valueChunkMarker); }
    }, SuperFlow);
};

class SequenceDelimitationPartMarker extends SequenceDelimitationPart {
    constructor() {
        super(false, base.emptyBuffer);
    }

    toString() {
        return "SequenceDelimitationMarker []";
    }
}
const sequenceDelimitationPartMarker = new SequenceDelimitationPartMarker();

class ItemDelimitationPartMarker extends ItemDelimitationPart {
    constructor(index) {
        super(index, false, base.emptyBuffer);
    }

    toString() {
        return "ItemDelimitationMarker []";
    }
}

const GuaranteedDelimitationEvents = function(SuperFlow) {
    return flowModel({
        onSequence: "guaranteedDelimitationEvents_onSequence",
        onItem: "guaranteedDelimitationEvents_onItem",
        onSequenceDelimitation: "guaranteedDelimitationEvents_onSequenceDelimitation",
        onItemDelimitation: "guaranteedDelimitationEvents_onItemDelimitation",
        onHeader: "guaranteedDelimitationEvents_onHeader",
        onValueChunk: "guaranteedDelimitationEvents_onValueChunk",
        onFragments: "guaranteedDelimitationEvents_onFragments"
    }, {
        _partStack: { value: [] },
        subtractLength: function(part) { this._partStack.value.forEach(p => p.bytesLeft -= part.bytes.length); },
        maybeDelimit: function() {
            let delimits = this._partStack.value
                .filter(p => p.bytesLeft <= 0) // find items and sequences that have ended
                .map(p => p.part instanceof ItemPart ? new ItemDelimitationPartMarker(p.part.index) : sequenceDelimitationPartMarker);
            this._partStack.value = this._partStack.value.filter(p => p.bytesLeft > 0); // only keep items and sequences with bytes left to subtract
            let out = delimits.map(d => (d instanceof ItemDelimitationPart) ? this.onItemDelimitation(d) : this.onSequenceDelimitation(d));
            return [].concat(...out);
        },
        subtractAndEmit: function(part, handle) {
            this.subtractLength(part);
            return handle(part).concat(this.maybeDelimit());
        },
        onSequence: function (part) {
            if (!part.indeterminate) {
                this.subtractLength(part);
                this._partStack.value.unshift({part: part, bytesLeft: part.length});
                return this.guaranteedDelimitationEvents_onSequence(part).concat(this.maybeDelimit());
            }
            return this.subtractAndEmit(part, this.guaranteedDelimitationEvents_onSequence);
        },
        onItem: function (part) {
            if (!this.inFragments() && !part.indeterminate) {
                this.subtractLength(part);
                this._partStack.value.unshift({part: part, bytesLeft: part.length});
                return this.guaranteedDelimitationEvents_onItem(part).concat(this.maybeDelimit());
            }
            return this.subtractAndEmit(part, this.guaranteedDelimitationEvents_onItem);
        },
        onSequenceDelimitation: function (part) {
            return this.subtractAndEmit(part, p => this.guaranteedDelimitationEvents_onSequenceDelimitation(p)
                .filter(d => d !== sequenceDelimitationPartMarker));
        },
        onItemDelimitation: function (part) {
            return this.subtractAndEmit(part, p => this.guaranteedDelimitationEvents_onItemDelimitation(p)
                .filter(d => !(d instanceof ItemDelimitationPartMarker)));
        },
        onHeader: function (part) { return this.subtractAndEmit(part, this.guaranteedDelimitationEvents_onHeader); },
        onValueChunk: function (part) { return this.subtractAndEmit(part, this.guaranteedDelimitationEvents_onValueChunk); },
        onFragments: function (part) { return this.subtractAndEmit(part, this.guaranteedDelimitationEvents_onFragments); }
    }, SuperFlow, InFragments);
};


const InSequence = function(SuperFlow) {
    return flowModel({
        onSequence: "inSequence_onSequence",
        onSequenceDelimitation: "inSequence_onSequenceDelimitation"
    }, {
        _sequenceDepth: { value: 0 },
        sequenceDepth: function () { return this._sequenceDepth.value; },
        inSequence: function() { return this._sequenceDepth.value > 0; },
        onSequence: function(part) {
            this._sequenceDepth.value += 1;
            return this.inSequence_onSequence(part);

        },
        onSequenceDelimitation: function(part) {
            this._sequenceDepth.value -= 1;
            return this.inSequence_onSequenceDelimitation(part);
        }
    }, SuperFlow, GuaranteedDelimitationEvents);
};

const TagPathTracking = function(SuperFlow) {
    return flowModel({
        onHeader: "tagPathTracking_onHeader",
        onFragments: "tagPathTracking_onFragments",
        onSequence: "tagPathTracking_onSequence",
        onSequenceDelimitation: "tagPathTracking_onSequenceDelimitation",
        onItem: "tagPathTracking_onItem",
        onItemDelimitation: "tagPathTracking_onItemDelimitation"
    }, {
        _tagPath: { value: emptyTagPath },
        tagPath: function() { return this._tagPath.value; },
        onHeader: function (part) {
            let t = this.tagPath();
            this._tagPath.value = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
            return this.tagPathTracking_onHeader(part);
        },
        onFragments: function (part) {
            let t = this.tagPath();
            this._tagPath.value = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
            return this.tagPathTracking_onFragments(part);

        },
        onSequence: function (part) {
            let t = this.tagPath();
            this._tagPath.value = t instanceof TagPathItem ? t.thenSequence(part.tag) : t.previous().thenSequence(part.tag);
            return this.tagPathTracking_onSequence(part);
        },
        onSequenceDelimitation: function (part) {
            let t = this.tagPath();
            if (!this.inFragments())
                this._tagPath.value = t.previous().thenSequenceEnd(t.tag());
            return this.tagPathTracking_onSequenceDelimitation(part);
        },
        onItem: function (part) {
            let t = this.tagPath();
            if (!this.inFragments())
                this._tagPath.value = t.previous().thenItem(t.tag(), part.index);
            return this.tagPathTracking_onItem(part);
        },
        onItemDelimitation: function (part) {
            let t = this.tagPath();
            if (t instanceof TagPathItem)
                this._tagPath.value = t.previous().thenItemEnd(t.tag(), t.item);
            else {
                let ti = t.previous();
                if (ti instanceof TagPathItem)
                    this._tagPath.value = ti.previous().thenItemEnd(ti.tag(), ti.item);
            }
            return this.tagPathTracking_onItemDelimitation(part);
        }
    }, SuperFlow, GuaranteedValueEvent, GuaranteedDelimitationEvents);
};

module.exports = {
    flowModel: flowModel,
    toFlow: toFlow,
    flow: flow,
    DicomFlow: DicomFlow,
    IdentityFlow: IdentityFlow,
    DeferToPartFlow: DeferToPartFlow,
    StartEvent: StartEvent,
    EndEvent: EndEvent,
    InFragments: InFragments,
    InSequence: InSequence,
    GuaranteedValueEvent: GuaranteedValueEvent,
    GuaranteedDelimitationEvents: GuaranteedDelimitationEvents,
    TagPathTracking: TagPathTracking,
    dicomStartMarker: dicomStartMarker,
    dicomEndMarker: dicomEndMarker,
    sequenceDelimitationPartMarker: sequenceDelimitationPartMarker,
    ItemDelimitationPartMarker: ItemDelimitationPartMarker,
    valueChunkMarker: valueChunkMarker
};
