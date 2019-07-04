import pipe from "multipipe";
import { Transform } from "readable-stream";
import * as base from "./base";
import * as flows from "./flows";
import {DeflatedChunk, DicomPart, FragmentsPart, HeaderPart, ItemDelimitationPart, ItemPart, MetaPart,
    PreamblePart, SequenceDelimitationPart, SequencePart, UnknownPart, ValueChunk} from "./parts";
import Tag from "./tag";
import {emptyTagPath, TagPath, TagPathItem} from "./tag-path";

// tslint:disable: max-classes-per-file

export function create(flow: any) {
    return pipe(flow.baseFlow(), flows.flatMapFlow(flow.handlePart.bind(flow)));
}

export abstract class DicomFlow {
    public abstract onPreamble(part: PreamblePart): any[];
    public abstract onHeader(part: HeaderPart): any[];
    public abstract onValueChunk(part: ValueChunk): any[];
    public abstract onSequence(part: SequencePart): any[];
    public abstract onSequenceDelimitation(part: SequenceDelimitationPart): any[];
    public abstract onFragments(part: FragmentsPart): any[];
    public abstract onItem(part: ItemPart): any[];
    public abstract onItemDelimitation(part: ItemDelimitationPart): any[];
    public abstract onDeflatedChunk(part: DeflatedChunk): any[];
    public abstract onUnknown(part: UnknownPart): any[];
    public abstract onPart(part: DicomPart): any[];
    public baseFlow(): Transform { return flows.identityFlow(true); }
    public handlePart(part: DicomPart): any[] {
        if (part instanceof PreamblePart) { return this.onPreamble(part); }
        if (part instanceof HeaderPart) { return this.onHeader(part); }
        if (part instanceof ValueChunk) { return this.onValueChunk(part); }
        if (part instanceof SequencePart) { return this.onSequence(part); }
        if (part instanceof SequenceDelimitationPart) { return this.onSequenceDelimitation(part); }
        if (part instanceof FragmentsPart) { return this.onFragments(part); }
        if (part instanceof ItemPart) { return this.onItem(part); }
        if (part instanceof ItemDelimitationPart) { return this.onItemDelimitation(part); }
        if (part instanceof DeflatedChunk) { return this.onDeflatedChunk(part); }
        if (part instanceof UnknownPart) { return this.onUnknown(part); }
        return this.onPart(part);
    }
}

/**
 * Depends on DicomFlow
 */
export class IdentityFlow extends DicomFlow {
    public onPreamble(part: PreamblePart): DicomPart[] { return [part]; }
    public onHeader(part: HeaderPart): DicomPart[] { return [part]; }
    public onValueChunk(part: ValueChunk): DicomPart[] { return [part]; }
    public onSequence(part: SequencePart): DicomPart[] { return [part]; }
    public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] { return [part]; }
    public onFragments(part: FragmentsPart): DicomPart[] { return [part]; }
    public onItem(part: ItemPart): DicomPart[] { return [part]; }
    public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] { return [part]; }
    public onDeflatedChunk(part: DeflatedChunk): DicomPart[] { return [part]; }
    public onUnknown(part: UnknownPart): DicomPart[] { return [part]; }
    public onPart(part: DicomPart): DicomPart[] { return [part]; }
}

/**
 * Depends on DicomFlow
 */
export abstract class DeferToPartFlow extends DicomFlow {
    public onPreamble(part: PreamblePart) { return this.onPart(part); }
    public onHeader(part: HeaderPart) { return this.onPart(part); }
    public onValueChunk(part: ValueChunk) { return this.onPart(part); }
    public onSequence(part: SequencePart) { return this.onPart(part); }
    public onSequenceDelimitation(part: SequenceDelimitationPart) { return this.onPart(part); }
    public onFragments(part: FragmentsPart) { return this.onPart(part); }
    public onDeflatedChunk(part: DeflatedChunk) { return this.onPart(part); }
    public onUnknown(part: UnknownPart) { return this.onPart(part); }
    public onItem(part: ItemPart) { return this.onPart(part); }
    public onItemDelimitation(part: ItemDelimitationPart) { return this.onPart(part); }
}

class DicomStartMarker extends MetaPart {
    public toString(): string {
        return "Start Marker []";
    }
}
export const dicomStartMarker = new DicomStartMarker();

export const StartEvent = (Super: any) => class extends Super {
    public onStart() { throw Error("Not implemented"); }
    public baseFlow() { return pipe(flows.prependFlow(dicomStartMarker, true), super.baseFlow()); }
    public handlePart(part: DicomPart) {
        return part === dicomStartMarker ? this.onStart() : super.handlePart(part);
    }
};

class DicomEndMarker extends MetaPart {
    public toString(): string {
        return "End Marker []";
    }
}
export const dicomEndMarker = new DicomEndMarker();

export const EndEvent = (Super: any) => class extends Super {
    public onEnd() { throw Error("Not implemented"); }
    public baseFlow() { return pipe(flows.appendFlow(dicomEndMarker, true), super.baseFlow()); }
    public handlePart(part: DicomPart) {
        return part === dicomEndMarker ? this.onEnd() : super.handlePart(part);
    }
};

export const InFragments = (Super: any) => class extends Super {
    public inFragments = false;

    public onFragments(part: FragmentsPart) {
        this.inFragments = true;
        return super.onFragments(part);
    }
    public onSequenceDelimitation(part: SequenceDelimitationPart) {
        this.inFragments = false;
        return super.onSequenceDelimitation(part);
    }
};

class ValueChunkMarker extends ValueChunk {
    constructor() {
        super(false, base.emptyBuffer, true);
    }

    public toString(): string {
        return "Value Chunk Marker []";
    }
}
export const valueChunkMarker = new ValueChunkMarker();

export const GuaranteedValueEvent = (Super: any) => class extends Super {
    public onHeader(part: HeaderPart) {
        return part.length === 0 ?
            super.onHeader(part).concat(this.onValueChunk(valueChunkMarker)) : super.onHeader(part);
    }
    public onItem(part: ItemPart) {
        return this.inFragments && part.length === 0 ?
            super.onItem(part).concat(this.onValueChunk(valueChunkMarker)) : super.onItem(part);
    }
    public onValueChunk(part: ValueChunk) {
        return super.onValueChunk(part).filter((c: any) => c !== valueChunkMarker);
    }
};

class SequenceDelimitationPartMarker extends SequenceDelimitationPart {
    constructor() {
        super(false, base.emptyBuffer);
    }

    public toString(): string {
        return "SequenceDelimitationMarker []";
    }
}
export const sequenceDelimitationPartMarker = new SequenceDelimitationPartMarker();

export class ItemDelimitationPartMarker extends ItemDelimitationPart {
    constructor(index: number) {
        super(index, false, base.emptyBuffer);
    }

    public toString(): string {
        return "ItemDelimitationMarker []";
    }
}

/**
 * Depends on InFragments
 */
export const GuaranteedDelimitationEvents = (Super: any) => class extends Super {
    public partStack: Array<{part: DicomPart, bytesLeft: number}> = [];

    public onSequence(part: SequencePart) {
        if (!part.indeterminate) {
            this.subtractLength(part);
            this.partStack.unshift({part, bytesLeft: part.length});
            return super.onSequence(part).concat(this.maybeDelimit());
        }
        return this.subtractAndEmit(part, super.onSequence.bind(this));
    }
    public onItem(part: ItemPart) {
        if (!this.inFragments && !part.indeterminate) {
            this.subtractLength(part);
            this.partStack.unshift({part, bytesLeft: part.length});
            return super.onItem(part).concat(this.maybeDelimit());
        }
        return this.subtractAndEmit(part, super.onItem.bind(this));
    }
    public onSequenceDelimitation(part: SequenceDelimitationPart) {
        return this.subtractAndEmit(part, (p) => super.onSequenceDelimitation(p)
            .filter((d: DicomPart) => d !== sequenceDelimitationPartMarker));
    }
    public onItemDelimitation(part: ItemDelimitationPart) {
        return this.subtractAndEmit(part, (p) => super.onItemDelimitation(p)
            .filter((d: DicomPart) => !(d instanceof ItemDelimitationPartMarker)));
    }
    public onHeader(part: HeaderPart) { return this.subtractAndEmit(part, super.onHeader.bind(this)); }
    public onValueChunk(part: ValueChunk) { return this.subtractAndEmit(part, super.onValueChunk.bind(this)); }
    public onFragments(part: FragmentsPart) { return this.subtractAndEmit(part, super.onFragments.bind(this)); }

    public subtractLength(part: DicomPart) {
        this.partStack.forEach((p) => p.bytesLeft -= part.bytes.length);
    }
    public maybeDelimit(): DicomPart[] {
        const delimits = this.partStack
            .filter((p) => p.bytesLeft <= 0) // find items and sequences that have ended
            .map((p) => p.part instanceof ItemPart ?
                new ItemDelimitationPartMarker(p.part.index) : sequenceDelimitationPartMarker);
        this.partStack = this.partStack
            .filter((p) => p.bytesLeft > 0); // only keep items and sequences with bytes left to subtract
        const out = delimits.map((d) => (d instanceof ItemDelimitationPart) ?
            this.onItemDelimitation(d) : this.onSequenceDelimitation(d));
        return [].concat(...out);
    }
    public subtractAndEmit(part: DicomPart, handle: (part: DicomPart) => DicomPart[]) {
        this.subtractLength(part);
        return handle(part).concat(this.maybeDelimit());
    }
};

/**
 * Depends on GuaranteedDelimitationEvents
 */
export const InSequence = (Super: any) => class extends Super {
    public sequenceDepth = 0;
    public inSequence = false;

    public onSequence(part: SequencePart) {
        this.sequenceDepth += 1;
        this.inSequence = this.sequenceDepth > 0;
        return super.onSequence(part);

    }
    public onSequenceDelimitation(part: SequenceDelimitationPart) {
        this.sequenceDepth -= 1;
        this.inSequence = this.sequenceDepth > 0;
        return super.onSequenceDelimitation(part);
    }
};

/**
 * Depends on GuaranteedValueEvent, GuaranteedDelimitationEvents, InFragments
 */
export const TagPathTracking = (Super: any) => class extends Super {
    public tagPath: TagPath = emptyTagPath;

    public onHeader(part: HeaderPart) {
        const t = this.tagPath;
        this.tagPath = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
        return super.onHeader(part);
    }
    public onFragments(part: FragmentsPart) {
        const t = this.tagPath;
        this.tagPath = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
        return super.onFragments(part);
    }
    public onSequence(part: SequencePart) {
        const t = this.tagPath;
        this.tagPath = t instanceof TagPathItem ? t.thenSequence(part.tag) : t.previous().thenSequence(part.tag);
        return super.onSequence(part);
    }
    public onSequenceDelimitation(part: SequenceDelimitationPart) {
        const t = this.tagPath;
        if (!this.inFragments) {
            this.tagPath = t.previous().thenSequenceEnd(t.tag());
        }
        return super.onSequenceDelimitation(part);
    }
    public onItem(part: ItemPart) {
        const t = this.tagPath;
        if (!this.inFragments) {
            this.tagPath = t.previous().thenItem(t.tag(), part.index);
        }
        return super.onItem(part);
    }
    public onItemDelimitation(part: ItemDelimitationPart) {
        const t = this.tagPath;
        if (t instanceof TagPathItem) {
            this.tagPath = t.previous().thenItemEnd(t.tag(), t.item);
        } else {
            const ti = t.previous();
            if (ti instanceof TagPathItem) {
                this.tagPath = ti.previous().thenItemEnd(ti.tag(), ti.item);
            }
        }
        return super.onItemDelimitation(part);
    }
};

/**
 * Depends on InFragments
 */
export const GroupLengthWarnings = (Super: any) => class extends Super {
    public silent = false;

    public setSilent(silent: boolean) { this.silent = silent; }
    public onHeader(part: HeaderPart) {
        if (!this.silent && base.isGroupLength(part.tag) && part.tag !== Tag.FileMetaInformationGroupLength) {
            console.warn("Group length attribute detected, consider removing group lengths to maintain valid " +
                "DICOM information");
        }
        return super.onHeader(part);
    }
    public onSequence(part: SequencePart) {
        if (!this.silent && !part.indeterminate && part.length > 0) {
            console.warn("Determinate length sequence detected, consider re-encoding sequences to indeterminate " +
                "length to maintain valid DICOM information");
        }
        return super.onSequence(part);
    }
    public onItem(part: ItemPart) {
        if (!this.silent && !this.inFragments && !part.indeterminate && part.length > 0) {
            console.warn("Determinate length item detected, consider re-encoding items to indeterminate length to " +
                "maintain valid DICOM information");
        }
        return super.onItem(part);
    }
};
