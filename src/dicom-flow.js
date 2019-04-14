const pipe = require("multipipe");
const base = require("./base");
const flows = require("./flows");
const {PreamblePart, HeaderPart, ValueChunk, SequencePart, SequenceDelimitationPart, FragmentsPart, ItemPart,
    ItemDelimitationPart, DeflatedChunk, UnknownPart, MetaPart} = require("./parts");
const {emptyTagPath, TagPathItem} = require("./tag-path");

const create = function (flow) {
    return pipe(flow.baseFlow(), flows.flatMapFlow(flow.handlePart.bind(flow)));
};

class DicomFlow {
    onPreamble(part) { throw Error("Not implemented"); }
    onHeader(part) { throw Error("Not implemented"); }
    onValueChunk(part) { throw Error("Not implemented"); }
    onSequence(part) { throw Error("Not implemented"); }
    onSequenceDelimitation(part) { throw Error("Not implemented"); }
    onFragments(part) { throw Error("Not implemented"); }
    onItem(part) { throw Error("Not implemented"); }
    onItemDelimitation(part) { throw Error("Not implemented"); }
    onDeflatedChunk(part) { throw Error("Not implemented"); }
    onUnknown(part) { throw Error("Not implemented"); }
    onPart(part) { throw Error("Not implemented"); }
    baseFlow() { return flows.identityFlow(true); }
    handlePart(part) {
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
}

/**
 * Depends on DicomFlow
 */
class IdentityFlow extends DicomFlow {
    onPreamble(part) { return [part]; }
    onHeader(part) { return [part]; }
    onValueChunk(part) { return [part]; }
    onSequence(part) { return [part]; }
    onSequenceDelimitation(part) { return [part]; }
    onFragments(part) { return [part]; }
    onItem(part) { return [part]; }
    onItemDelimitation(part) { return [part]; }
    onDeflatedChunk(part) { return [part]; }
    onUnknown(part) { return [part]; }
    onPart(part) { return [part]; }
}

/**
 * Depends on DicomFlow
 */
class DeferToPartFlow extends DicomFlow {
    onPreamble(part) { return this.onPart(part); }
    onHeader(part) { return this.onPart(part); }
    onValueChunk(part) { return this.onPart(part); }
    onSequence(part) { return this.onPart(part); }
    onSequenceDelimitation(part) { return this.onPart(part); }
    onFragments(part) { return this.onPart(part); }
    onDeflatedChunk(part) { return this.onPart(part); }
    onUnknown(part) { return this.onPart(part); }
    onItem(part) { return this.onPart(part); }
    onItemDelimitation(part) { return this.onPart(part); }
}

class DicomStartMarker extends MetaPart {
    toString() {
        return "Start Marker []";
    }
}
const dicomStartMarker = new DicomStartMarker();

const StartEvent = Super => class extends Super {
    onStart() { throw Error("Not implemented"); }
    baseFlow() { return pipe(flows.prependFlow(dicomStartMarker, true), super.baseFlow()); }
    handlePart(part) { return part === dicomStartMarker ? this.onStart() : super.handlePart(part); }
};

class DicomEndMarker extends MetaPart {
    toString() {
        return "End Marker []";
    }
}
const dicomEndMarker = new DicomEndMarker();

const EndEvent = Super => class extends Super {
    onEnd() { throw Error("Not implemented"); }
    baseFlow() { return pipe(flows.appendFlow(dicomEndMarker, true), super.baseFlow()); }
    handlePart(part) { return part === dicomEndMarker ? this.onEnd() : super.handlePart(part); }
};

const InFragments = Super => class extends Super {
    constructor() {
        super();
        this.inFragments = false;
    }
    onFragments(part) {
        this.inFragments = true;
        return super.onFragments(part);
    }
    onSequenceDelimitation(part) {
        this.inFragments = false;
        return super.onSequenceDelimitation(part);
    }
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

const GuaranteedValueEvent = Super => class extends Super {
    onHeader(part) { return part.length === 0 ? super.onHeader(part).concat(this.onValueChunk(valueChunkMarker)) : super.onHeader(part); }
    onItem(part) { return this.inFragments && part.length === 0 ? super.onItem(part).concat(this.onValueChunk(valueChunkMarker)) : super.onItem(part); }
    onValueChunk(part) { return super.onValueChunk(part).filter(c => c !== valueChunkMarker); }
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

/**
 * Depends on InFragments
 */
const GuaranteedDelimitationEvents = Super => class extends Super {
    constructor() {
        super();
        this.partStack = [];
    }

    subtractLength(part) { this.partStack.forEach(p => p.bytesLeft -= part.bytes.length); }
    maybeDelimit() {
        let delimits = this.partStack
            .filter(p => p.bytesLeft <= 0) // find items and sequences that have ended
            .map(p => p.part instanceof ItemPart ? new ItemDelimitationPartMarker(p.part.index) : sequenceDelimitationPartMarker);
        this.partStack = this.partStack.filter(p => p.bytesLeft > 0); // only keep items and sequences with bytes left to subtract
        let out = delimits.map(d => (d instanceof ItemDelimitationPart) ? this.onItemDelimitation(d) : this.onSequenceDelimitation(d));
        return [].concat(...out);
    }
    subtractAndEmit(part, handle) {
        this.subtractLength(part);
        return handle(part).concat(this.maybeDelimit());
    }
    onSequence (part) {
        if (!part.indeterminate) {
            this.subtractLength(part);
            this.partStack.unshift({part: part, bytesLeft: part.length});
            return super.onSequence(part).concat(this.maybeDelimit());
        }
        return this.subtractAndEmit(part, super.onSequence.bind(this));
    }
    onItem (part) {
        if (!this.inFragments && !part.indeterminate) {
            this.subtractLength(part);
            this.partStack.unshift({part: part, bytesLeft: part.length});
            return super.onItem(part).concat(this.maybeDelimit());
        }
        return this.subtractAndEmit(part, super.onItem.bind(this));
    }
    onSequenceDelimitation (part) {
        return this.subtractAndEmit(part, p => super.onSequenceDelimitation(p)
            .filter(d => d !== sequenceDelimitationPartMarker));
    }
    onItemDelimitation (part) {
        return this.subtractAndEmit(part, p => super.onItemDelimitation(p)
            .filter(d => !(d instanceof ItemDelimitationPartMarker)));
    }
    onHeader (part) { return this.subtractAndEmit(part, super.onHeader.bind(this)); }
    onValueChunk (part) { return this.subtractAndEmit(part, super.onValueChunk.bind(this)); }
    onFragments (part) { return this.subtractAndEmit(part, super.onFragments.bind(this)); }
};

/**
 * Depends on GuaranteedDelimitationEvents
 */
const InSequence = Super => class extends Super {
    constructor() {
        super();
        this.sequenceDepth = 0;
        this.inSequence = false;
    }

    onSequence(part) {
        this.sequenceDepth += 1;
        this.inSequence = this.sequenceDepth > 0;
        return super.onSequence(part);

    }
    onSequenceDelimitation(part) {
        this.sequenceDepth -= 1;
        this.inSequence = this.sequenceDepth > 0;
        return super.onSequenceDelimitation(part);
    }
};

/**
 * Depends on GuaranteedValueEvent, GuaranteedDelimitationEvents, InFragments
 */
const TagPathTracking = Super => class extends Super {
    constructor() {
        super();
        this.tagPath = emptyTagPath;
    }

    onHeader(part) {
        let t = this.tagPath;
        this.tagPath = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
        return super.onHeader(part);
    }
    onFragments(part) {
        let t = this.tagPath;
        this.tagPath = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
        return super.onFragments(part);
    }
    onSequence(part) {
        let t = this.tagPath;
        this.tagPath = t instanceof TagPathItem ? t.thenSequence(part.tag) : t.previous().thenSequence(part.tag);
        return super.onSequence(part);
    }
    onSequenceDelimitation(part) {
        let t = this.tagPath;
        if (!this.inFragments)
            this.tagPath = t.previous().thenSequenceEnd(t.tag());
        return super.onSequenceDelimitation(part);
    }
    onItem(part) {
        let t = this.tagPath;
        if (!this.inFragments)
            this.tagPath = t.previous().thenItem(t.tag(), part.index);
        return super.onItem(part);
    }
    onItemDelimitation(part) {
        let t = this.tagPath;
        if (t instanceof TagPathItem)
            this.tagPath = t.previous().thenItemEnd(t.tag(), t.item);
        else {
            let ti = t.previous();
            if (ti instanceof TagPathItem)
                this.tagPath = ti.previous().thenItemEnd(ti.tag(), ti.item);
        }
        return super.onItemDelimitation(part);
    }
};

/**
 * Depends on InFragments
 */
const GroupLengthWarnings = Super => class extends Super {
    constructor() {
        super();
        this.silent = false;
    }

    setSilent(silent) { this.silent = silent; }
    onHeader(part) {
        if (!this.silent && base.isGroupLength(part.tag) && part.tag !== Tag.FileMetaInformationGroupLength)
            console.warn("Group length attribute detected, consider removing group lengths to maintain valid DICOM information");
        return super.onHeader(part);
    }
    onSequence(part) {
        if (!this.silent && !part.indeterminate && part.length > 0)
            console.warn("Determinate length sequence detected, consider re-encoding sequences to indeterminate length to maintain valid DICOM information");
        return super.onSequence(part);
    }
    onItem(part) {
        if (!this.silent && !this.inFragments && !part.indeterminate && part.length > 0)
            console.warn("Determinate length item detected, consider re-encoding items to indeterminate length to maintain valid DICOM information");
        return super.onItem(part);
    }
};


module.exports = {
    create: create,
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
    GroupLengthWarnings: GroupLengthWarnings,
    dicomStartMarker: dicomStartMarker,
    dicomEndMarker: dicomEndMarker,
    sequenceDelimitationPartMarker: sequenceDelimitationPartMarker,
    ItemDelimitationPartMarker: ItemDelimitationPartMarker,
    valueChunkMarker: valueChunkMarker
};
