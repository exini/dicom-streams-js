import { Transform } from 'stream';
import { emptyBuffer, indeterminateLength, isGroupLength, pipe } from './base';
import { appendFlow, flatMapFlow, identityFlow, prependFlow } from './flows';
import {
    DeflatedChunk,
    DicomPart,
    FragmentsPart,
    HeaderPart,
    ItemDelimitationPart,
    ItemPart,
    MetaPart,
    PreamblePart,
    SequenceDelimitationPart,
    SequencePart,
    UnknownPart,
    ValueChunk,
} from './dicom-parts';
import { Tag } from './tag';
import { emptyTagPath, TagPath, TagPathItem, TagPathItemEnd } from './tag-path';

export function createFlow(flow: any): any {
    return pipe(flow.baseFlow(), flatMapFlow(flow.handlePart.bind(flow)));
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
    public baseFlow(): Transform {
        return identityFlow(true);
    }
    public handlePart(part: DicomPart): any[] {
        if (part instanceof PreamblePart) {
            return this.onPreamble(part);
        }
        if (part instanceof HeaderPart) {
            return this.onHeader(part);
        }
        if (part instanceof ValueChunk) {
            return this.onValueChunk(part);
        }
        if (part instanceof SequencePart) {
            return this.onSequence(part);
        }
        if (part instanceof SequenceDelimitationPart) {
            return this.onSequenceDelimitation(part);
        }
        if (part instanceof FragmentsPart) {
            return this.onFragments(part);
        }
        if (part instanceof ItemPart) {
            return this.onItem(part);
        }
        if (part instanceof ItemDelimitationPart) {
            return this.onItemDelimitation(part);
        }
        if (part instanceof DeflatedChunk) {
            return this.onDeflatedChunk(part);
        }
        if (part instanceof UnknownPart) {
            return this.onUnknown(part);
        }
        return this.onPart(part);
    }
}

/**
 * Depends on DicomFlow
 */
export class IdentityFlow extends DicomFlow {
    public onPreamble(part: PreamblePart): DicomPart[] {
        return [part];
    }
    public onHeader(part: HeaderPart): DicomPart[] {
        return [part];
    }
    public onValueChunk(part: ValueChunk): DicomPart[] {
        return [part];
    }
    public onSequence(part: SequencePart): DicomPart[] {
        return [part];
    }
    public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
        return [part];
    }
    public onFragments(part: FragmentsPart): DicomPart[] {
        return [part];
    }
    public onItem(part: ItemPart): DicomPart[] {
        return [part];
    }
    public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
        return [part];
    }
    public onDeflatedChunk(part: DeflatedChunk): DicomPart[] {
        return [part];
    }
    public onUnknown(part: UnknownPart): DicomPart[] {
        return [part];
    }
    public onPart(part: DicomPart): DicomPart[] {
        return [part];
    }
}

/**
 * Depends on DicomFlow
 */
export abstract class DeferToPartFlow extends DicomFlow {
    public onPreamble(part: PreamblePart): DicomPart[] {
        return this.onPart(part);
    }
    public onHeader(part: HeaderPart): DicomPart[] {
        return this.onPart(part);
    }
    public onValueChunk(part: ValueChunk): DicomPart[] {
        return this.onPart(part);
    }
    public onSequence(part: SequencePart): DicomPart[] {
        return this.onPart(part);
    }
    public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
        return this.onPart(part);
    }
    public onFragments(part: FragmentsPart): DicomPart[] {
        return this.onPart(part);
    }
    public onDeflatedChunk(part: DeflatedChunk): DicomPart[] {
        return this.onPart(part);
    }
    public onUnknown(part: UnknownPart): DicomPart[] {
        return this.onPart(part);
    }
    public onItem(part: ItemPart): DicomPart[] {
        return this.onPart(part);
    }
    public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
        return this.onPart(part);
    }
}

class DicomStartMarker extends MetaPart {
    public toString(): string {
        return 'Start Marker []';
    }
}
export const dicomStartMarker = new DicomStartMarker();

export const StartEvent = (Super: any): any =>
    class extends Super {
        public onStart(): DicomPart[] {
            throw Error('Not implemented');
        }
        public baseFlow(): any {
            return pipe(prependFlow(dicomStartMarker, true), super.baseFlow());
        }
        public handlePart(part: DicomPart): DicomPart[] {
            return part === dicomStartMarker ? this.onStart() : super.handlePart(part);
        }
    };

class DicomEndMarker extends MetaPart {
    public toString(): string {
        return 'End Marker []';
    }
}
export const dicomEndMarker = new DicomEndMarker();

export const EndEvent = (Super: any): any =>
    class extends Super {
        public onEnd(): DicomPart[] {
            throw Error('Not implemented');
        }
        public baseFlow(): any {
            return pipe(appendFlow(dicomEndMarker, true), super.baseFlow());
        }
        public handlePart(part: DicomPart): DicomPart[] {
            return part === dicomEndMarker ? this.onEnd() : super.handlePart(part);
        }
    };

export const InFragments = (Super: any): any =>
    class extends Super {
        public inFragments = false;

        public onFragments(part: FragmentsPart): DicomPart[] {
            this.inFragments = true;
            return super.onFragments(part);
        }
        public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
            this.inFragments = false;
            return super.onSequenceDelimitation(part);
        }
    };

export class ValueChunkMarker extends ValueChunk {
    constructor(bigEndian: boolean) {
        super(bigEndian, emptyBuffer, true);
    }

    public toString(): string {
        return `Value Chunk Marker [bigEndian=${this.bigEndian}]`;
    }
}

export const GuaranteedValueEvent = (Super: any): any =>
    class extends Super {
        public onHeader(part: HeaderPart): DicomPart[] {
            return part.length === 0
                ? super.onHeader(part).concat(this.onValueChunk(new ValueChunkMarker(part.bigEndian)))
                : super.onHeader(part);
        }
        public onItem(part: ItemPart): DicomPart[] {
            return this.inFragments && part.length === 0
                ? super.onItem(part).concat(this.onValueChunk(new ValueChunkMarker(part.bigEndian)))
                : super.onItem(part);
        }
        public onValueChunk(part: ValueChunk): DicomPart[] {
            return super.onValueChunk(part).filter((c: any) => !(c instanceof ValueChunkMarker));
        }
    };

export class SequenceDelimitationPartMarker extends SequenceDelimitationPart {
    constructor(bigEndian: boolean) {
        super(bigEndian, emptyBuffer);
    }

    public toString(): string {
        return `SequenceDelimitationMarker [bigEndian=${this.bigEndian}]`;
    }
}

export class ItemDelimitationPartMarker extends ItemDelimitationPart {
    constructor(bigEndian: boolean) {
        super(bigEndian, emptyBuffer);
    }

    public toString(): string {
        return `ItemDelimitationMarker [bigEndian=${this.bigEndian}]`;
    }
}

/**
 * Depends on InFragments
 */
export const GuaranteedDelimitationEvents = (Super: any): any =>
    class extends Super {
        public partStack: { part: DicomPart; bytesLeft: number }[] = [];

        public onSequence(part: SequencePart): DicomPart[] {
            this.subtractLength(part);
            this.partStack.unshift({ part, bytesLeft: part.length });
            return super.onSequence(part).concat(this.maybeDelimit());
        }
        public onItem(part: ItemPart): DicomPart[] {
            this.subtractLength(part);
            if (!this.inFragments) {
                this.partStack.unshift({ part, bytesLeft: part.length });
            }
            return super.onItem(part).concat(this.maybeDelimit());
        }
        public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
            if (this.partStack.length > 0 && !(part instanceof SequenceDelimitationPartMarker) && !this.inFragments) {
                this.partStack.shift();
            }
            return this.subtractAndEmit(part, (p) =>
                super.onSequenceDelimitation(p).filter((d: DicomPart) => !(d instanceof SequenceDelimitationPartMarker)),
            );
        }
        public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
            if (this.partStack.length > 0 && !(part instanceof ItemDelimitationPartMarker)) {
                this.partStack.shift();
            }
            return this.subtractAndEmit(part, (p) =>
                super.onItemDelimitation(p).filter((d: DicomPart) => !(d instanceof ItemDelimitationPartMarker)),
            );
        }
        public onHeader(part: HeaderPart): DicomPart[] {
            return this.subtractAndEmit(part, super.onHeader.bind(this));
        }
        public onValueChunk(part: ValueChunk): DicomPart[] {
            return this.subtractAndEmit(part, super.onValueChunk.bind(this));
        }
        public onFragments(part: FragmentsPart): DicomPart[] {
            return this.subtractAndEmit(part, super.onFragments.bind(this));
        }

        public subtractLength(part: DicomPart): void {
            this.partStack.forEach((p) => {
                if (p.bytesLeft != indeterminateLength) {
                    p.bytesLeft -= part.bytes.length;
                }
            });
        }
        public maybeDelimit(): DicomPart[] {
            let splitIndex = 0;
            while (
                splitIndex < this.partStack.length &&
                this.partStack[splitIndex].bytesLeft != indeterminateLength &&
                this.partStack[splitIndex].bytesLeft <= 0
            ) {
                splitIndex++;
            }
            const inactive = this.partStack.slice(0, splitIndex);
            this.partStack = this.partStack.slice(splitIndex);
            const out = inactive.map((i) =>
                i.part instanceof ItemPart
                    ? this.onItemDelimitation(new ItemDelimitationPartMarker(i.part.bigEndian))
                    : this.onSequenceDelimitation(new SequenceDelimitationPartMarker(i.part.bigEndian)),
            );
            return [].concat(...out);
        }
        public subtractAndEmit(part: DicomPart, handle: (part: DicomPart) => DicomPart[]): DicomPart[] {
            this.subtractLength(part);
            return handle(part).concat(this.maybeDelimit());
        }
    };

/**
 * Depends on GuaranteedDelimitationEvents
 */
export const InSequence = (Super: any): any =>
    class extends Super {
        public sequenceStack: SequencePart[] = [];

        public sequenceDepth(): number {
            return this.sequenceStack.length;
        }
        public inSequence(): boolean {
            return this.sequenceStack.length > 0;
        }
        public onSequence(part: SequencePart): DicomPart[] {
            this.sequenceStack.unshift(part);
            return super.onSequence(part);
        }
        public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
            if (!this.inFragments) {
                this.sequenceStack.shift();
            }
            return super.onSequenceDelimitation(part);
        }
    };

/**
 * Depends on GuaranteedValueEvent, GuaranteedDelimitationEvents, InFragments
 */
export const TagPathTracking = (Super: any): any =>
    class extends Super {
        public tagPath: TagPath = emptyTagPath;

        public onHeader(part: HeaderPart): DicomPart[] {
            const t = this.tagPath;
            this.tagPath = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
            return super.onHeader(part);
        }
        public onFragments(part: FragmentsPart): DicomPart[] {
            const t = this.tagPath;
            this.tagPath = t instanceof TagPathItem ? t.thenTag(part.tag) : t.previous().thenTag(part.tag);
            return super.onFragments(part);
        }
        public onSequence(part: SequencePart): DicomPart[] {
            const t = this.tagPath;
            this.tagPath = t instanceof TagPathItem ? t.thenSequence(part.tag) : t.previous().thenSequence(part.tag);
            return super.onSequence(part);
        }
        public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
            const t = this.tagPath;
            if (!this.inFragments) {
                this.tagPath = t.previous().thenSequenceEnd(t.tag());
            }
            return super.onSequenceDelimitation(part);
        }
        public onItem(part: ItemPart): DicomPart[] {
            const t = this.tagPath;
            if (!this.inFragments) {
                if (t instanceof TagPathItemEnd) {
                    this.tagPath = t.previous().thenItem(t.tag(), t.item + 1);
                } else {
                    this.tagPath = t.previous().thenItem(t.tag(), 1);
                }
            }
            return super.onItem(part);
        }
        public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
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
export const GroupLengthWarnings = (Super: any): any =>
    class extends Super {
        public silent = false;

        public setSilent(silent: boolean): void {
            this.silent = silent;
        }
        public onHeader(part: HeaderPart): DicomPart[] {
            if (!this.silent && isGroupLength(part.tag) && part.tag !== Tag.FileMetaInformationGroupLength) {
                console.warn(
                    'Group length attribute detected, consider removing group lengths to maintain valid ' +
                        'DICOM information',
                );
            }
            return super.onHeader(part);
        }
        public onSequence(part: SequencePart): DicomPart[] {
            if (!this.silent && !part.indeterminate && part.length > 0) {
                console.warn(
                    'Determinate length sequence detected, consider re-encoding sequences to indeterminate ' +
                        'length to maintain valid DICOM information',
                );
            }
            return super.onSequence(part);
        }
        public onItem(part: ItemPart): DicomPart[] {
            if (!this.silent && !this.inFragments && !part.indeterminate && part.length > 0) {
                console.warn(
                    'Determinate length item detected, consider re-encoding items to indeterminate length to ' +
                        'maintain valid DICOM information',
                );
            }
            return super.onItem(part);
        }
    };
