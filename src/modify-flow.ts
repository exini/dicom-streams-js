import * as base from "./base";
import {
    create, DeferToPartFlow, EndEvent, GroupLengthWarnings, GuaranteedDelimitationEvents,
    GuaranteedValueEvent, InFragments, TagPathTracking,
} from "./dicom-flow";
import * as Lookup from "./lookup";
import {DicomPart, HeaderPart, MetaPart, SequencePart, ValueChunk} from "./parts";
import {emptyTagPath, TagPath} from "./tag-path";
import * as VR from "./vr";

// tslint:disable: max-classes-per-file

export class TagModification {
    public static equals(tagPath: TagPath, modification: (b: Buffer) => Buffer): TagModification {
        return new TagModification(tagPath.isEqualTo.bind(tagPath), modification);
    }

    public static endsWith(tagPath: TagPath, modification: (b: Buffer) => Buffer): TagModification {
        return new TagModification((tp) => tp.endsWith(tagPath), modification);
    }

    constructor(
        public readonly matches: (t: TagPath) => boolean,
        public readonly modification: (b: Buffer) => Buffer) {}
}

export class TagInsertion {
    constructor(
        public readonly tagPath: TagPath,
        public readonly insertion: (b: Buffer) => Buffer) {
        this.tagPath = tagPath;
        this.insertion = insertion;
    }
}

export class TagModificationsPart extends MetaPart {
    constructor(
        public readonly modifications: TagModification[] = [],
        public readonly insertions: TagInsertion[] = [],
        public readonly replace: boolean = false) {
        super();
    }
}

export function modifyFlow(
    modifications: TagModification[] = [], insertions: TagInsertion[] = [], logGroupLengthWarnings: boolean = true) {
    const mods = modifications === undefined ? [] : modifications;
    const irts = insertions === undefined ? [] : insertions;
    const wrns = logGroupLengthWarnings === undefined ? true : logGroupLengthWarnings;

    const organizeInsertions = (inserts: TagInsertion[]): TagInsertion[] => {
        const distinct = inserts.filter((a, pos, arr) => {
            return arr.findIndex((b) => b.tagPath.isEqualTo(a.tagPath)) === pos;
        }); // distinct by tag path
        return distinct.sort((a, b) => a.tagPath.isBelow(b.tagPath) ? -1 : 1); // ordered by tag path
    };

    return create(new class extends TagPathTracking(
        GuaranteedValueEvent(GuaranteedDelimitationEvents(GroupLengthWarnings(InFragments(
            EndEvent(DeferToPartFlow)))))) {

        private currentModifications: TagModification[] = mods;
        private currentInsertions: TagInsertion[] = organizeInsertions(irts.slice());

        private currentModification: TagModification;
        private currentHeader: HeaderPart;
        private latestTagPath: TagPath = emptyTagPath;
        private value: Buffer = base.emptyBuffer;
        private bigEndian: boolean = false;
        private explicitVR: boolean = true;

        constructor() {
            super();
            this.setSilent(!wrns);
        }

        public onPart(part: DicomPart): DicomPart[] {
            if (part instanceof TagModificationsPart) {
                if (part.replace) {
                    this.currentModifications = part.modifications;
                    this.currentInsertions = organizeInsertions(part.insertions.slice());
                } else {
                    this.currentModifications = base.concatArrays(this.currentModifications, part.modifications);
                    this.currentInsertions = organizeInsertions(
                        base.concatArrays(this.currentInsertions, part.insertions));
                }
                return [];
            }

            if (part instanceof HeaderPart) {
                this.updateSyntax(part);
                const insertParts = this.findInsertParts();
                const modifyPart = this.findModifyPart(part);
                this.latestTagPath = this.tagPath;
                return base.concatArrays(insertParts, modifyPart);
            }

            if (part instanceof SequencePart) {
                const insertParts = this.findInsertParts();
                this.latestTagPath = this.tagPath;
                return base.appendToArray(part, insertParts);
            }

            if (part instanceof ValueChunk) {
                if (this.currentModification !== undefined && this.currentHeader !== undefined) {
                    this.value = base.concat(this.value, part.bytes);
                    if (part.last) {
                        const newValue = base.padToEvenLength(
                            this.currentModification.modification(this.value), this.currentHeader.vr);
                        const newHeader = this.currentHeader.withUpdatedLength(newValue.length);
                        this.currentModification = undefined;
                        this.currentHeader = undefined;
                        return base.prependToArray(newHeader, this.valueOrNot(newValue));
                    } else {
                        return [];
                    }
                } else {
                    return [part];
                }
            }

            this.latestTagPath = this.tagPath;
            return [part];
        }

        public onEnd(): DicomPart[] {
            if (this.latestTagPath.isEmpty()) {
                return [];
            } else {
                return base.flatten(this.currentInsertions
                    .filter((i) => i.tagPath.isRoot())
                    .filter((m) => this.latestTagPath.isBelow(m.tagPath))
                    .map((m) => this.headerAndValueParts(
                        m.tagPath, base.padToEvenLength(m.insertion(undefined), m.tagPath.tag()))));
            }
        }

        private updateSyntax(header: HeaderPart): void {
            this.bigEndian = header.bigEndian;
            this.explicitVR = header.explicitVR;
        }

        private valueOrNot(bytes: Buffer): DicomPart[] {
            return bytes.length > 0 ? [new ValueChunk(this.bigEndian, bytes, true)] : [];
        }

        private headerAndValueParts(tagPath: TagPath, valueBytes: Buffer) {
            const vr = Lookup.vrOf(tagPath.tag());
            if (vr === VR.UN) {
                throw Error("Tag is not present in dictionary, cannot determine value representation");
            }
            if (vr === VR.SQ) {
                throw Error("Cannot insert sequences");
            }
            const header = HeaderPart.create(tagPath.tag(), vr, valueBytes.length, this.bigEndian, this.explicitVR);
            return base.prependToArray(header, this.valueOrNot(valueBytes));
        }

        private isBetween(lowerTag: TagPath, tagToTest: TagPath, upperTag: TagPath): boolean {
            return lowerTag.isBelow(tagToTest) && tagToTest.isBelow(upperTag);
        }

        private isInDataset(tagToTest: TagPath, tagPath: TagPath): boolean {
            return tagToTest.previous().isEqualTo(tagPath.previous());
        }

        private findInsertParts(): DicomPart[] {
            return base.flatten(this.currentInsertions
                .filter((i) => this.isBetween(this.latestTagPath, i.tagPath, this.tagPath))
                .filter((i) => this.isInDataset(i.tagPath, this.tagPath))
                .map((i) => this.headerAndValueParts(
                    i.tagPath, base.padToEvenLength(i.insertion(undefined), i.tagPath.tag()))));
        }

        private findModifyPart(header: HeaderPart) {
            const mod = this.currentModifications.find((m) => m.matches(this.tagPath));
            if (mod !== undefined) {
                this.currentHeader = header;
                this.currentModification = mod;
                this.value = base.emptyBuffer;
                return [];
            } else {
                const ins = this.currentInsertions.find((i) => i.tagPath.isEqualTo(this.tagPath));
                if (ins !== undefined) {
                    this.currentHeader = header;
                    this.currentModification =
                        new TagModification((tp) => tp.isEqualTo(ins.tagPath), (v) => ins.insertion(v));
                    this.value = base.emptyBuffer;
                    return [];
                } else {
                    return [header];
                }
            }
        }
    }());
}
