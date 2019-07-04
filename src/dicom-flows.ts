import pipe from "multipipe";
import {Transform} from "readable-stream";
import zlib from "zlib";
import * as base from "./base";
import {CharacterSets} from "./character-sets";
import {collectFlow, collectFromTagPathsFlow} from "./collect-flow";
import {Detour} from "./detour";
import {
    create, DeferToPartFlow, dicomEndMarker, EndEvent, GroupLengthWarnings, GuaranteedDelimitationEvents,
    GuaranteedValueEvent, IdentityFlow, InFragments, InSequence, TagPathTracking,
} from "./dicom-flow";
import {modifyFlow, TagInsertion} from "./modify-flow";
import {
    DeflatedChunk, DicomPart, ElementsPart, HeaderPart, ItemDelimitationPart, ItemPart, PreamblePart,
    SequenceDelimitationPart, SequencePart, ValueChunk,
} from "./parts";
import Tag from "./tag";
import {TagPath} from "./tag-path";
import {emptyTagPath} from "./tag-path";
import {TagTree} from "./tag-tree";
import UID from "./uid";
import * as VR from "./vr";

// tslint:disable: max-classes-per-file

export function toBytesFlow(): Transform {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
            this.push(chunk.bytes);
            process.nextTick(() => callback());
        },
    });
}

export function stopTagFlow(tag: number) {
    let endReached = false;

    return pipe(
        create(new class extends InSequence(GuaranteedDelimitationEvents(InFragments(IdentityFlow))) {
            public onHeader(part: HeaderPart): DicomPart[] {
                return this.inSequence || part.tag < tag ? [part] : [dicomEndMarker];
            }
        }()),
        new Transform({
            objectMode: true,
            transform(chunk, encoding, callback) {
                if (!endReached) {
                    if (chunk === dicomEndMarker) {
                        endReached = true;
                        this.push(null);
                    } else {
                        this.push(chunk);
                    }
                }
                process.nextTick(() => callback());
            },
        }),
    );
}

export function whitelistFilter(
    whitelist: TagTree[],
    defaultCondition?: (p: DicomPart) => boolean,
    logGroupLengthWarnings?: boolean) {
    return tagFilter((currentPath) =>
        whitelist.some((t) =>
            t.hasTrunk(currentPath) || t.isTrunkOf(currentPath)), defaultCondition, logGroupLengthWarnings);
}

export function blacklistFilter(
    blacklist: TagTree[],
    defaultCondition?: (p: DicomPart) => boolean,
    logGroupLengthWarnings?: boolean) {
    return tagFilter((currentPath) =>
        !blacklist.some((t) => t.isTrunkOf(currentPath)), defaultCondition, logGroupLengthWarnings);
}

export function groupLengthDiscardFilter() {
    return tagFilter((tagPath) =>
        !base.isGroupLength(tagPath.tag()) || base.isFileMetaInformation(tagPath.tag()));
}

export function fmiDiscardFilter() {
    return tagFilter((tagPath) => !base.isFileMetaInformation(tagPath.tag()), () => false);
}

export function tagFilter(
    keepCondition: (t: TagPath) => boolean,
    defaultCondition: (p: DicomPart) => boolean = () => true, logGroupLengthWarnings: boolean = false) {
    return create(new class extends TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(
        GroupLengthWarnings(InFragments(DeferToPartFlow))))) {

        private keeping = false;

        constructor() {
            super();
            this.setSilent(!logGroupLengthWarnings);
        }

        public onPart(part: DicomPart): DicomPart[] {
            this.keeping = this.tagPath === emptyTagPath ? defaultCondition(part) : keepCondition(this.tagPath);
            return this.keeping ? [part] : [];
        }
    }());
}

export function headerFilter(keepCondition: (p: DicomPart) => boolean, logGroupLengthWarnings: boolean = false) {
    return create(new class extends GroupLengthWarnings(InFragments(DeferToPartFlow)) {

        private keeping = false;

        constructor() {
            super();
            this.setSilent(!logGroupLengthWarnings);
        }

        public onPart(part: DicomPart): DicomPart[] {
            if (part instanceof HeaderPart) {
                this.keeping = keepCondition(part);
                return this.keeping ? [part] : [];
            }
            if (part instanceof ValueChunk) {
                return this.keeping ? [part] : [];
            }
            this.keeping = true;
            return [part];
        }
    }());
}

export class ValidationContext {
    constructor(public readonly sopClassUID: string, public readonly transferSyntaxUID: string) {}
}

export function validateContextFlow(contexts: ValidationContext[]) {
    return pipe(
        collectFromTagPathsFlow([
            TagPath.fromTag(Tag.MediaStorageSOPClassUID),
            TagPath.fromTag(Tag.TransferSyntaxUID),
            TagPath.fromTag(Tag.SOPClassUID),
        ], "validatecontext"),
        create(new class extends DeferToPartFlow {
            public onPart(part: DicomPart): DicomPart[] {
                if (part instanceof ElementsPart && part.label === "validatecontext") {
                    let scuid = part.elements.stringByTag(Tag.MediaStorageSOPClassUID);
                    if (scuid === undefined) { scuid = part.elements.stringByTag(Tag.SOPClassUID); }
                    if (scuid === undefined) { scuid = "<empty>"; }
                    let tsuid = part.elements.stringByTag(Tag.TransferSyntaxUID);
                    if (tsuid === undefined) { tsuid = "<empty>"; }
                    if (contexts.findIndex((c) => c.sopClassUID === scuid && c.transferSyntaxUID === tsuid) >= 0) {
                        return [];
                    } else {
                        throw Error("The presentation context [SOPClassUID = " + scuid + ", TransferSyntaxUID = " +
                            tsuid + "] is not supported");
                    }
                }
                return [part];
            }
        }()));
}

export function fmiGroupLengthFlow() {
    return pipe(
        collectFlow(
            (tagPath) => tagPath.isRoot() && base.isFileMetaInformation(tagPath.tag()),
            (tagPath) => !base.isFileMetaInformation(tagPath.tag()),
            "fmigrouplength",
        ), tagFilter(
            (tagPath) => !base.isFileMetaInformation(tagPath.tag()),
            () => true,
            false,
        ), create(new class extends EndEvent(DeferToPartFlow) {

            private fmi: DicomPart[] = [];
            private hasEmitted = false;

            public onEnd(): DicomPart[] {
                return this.hasEmitted ? [] : this.fmi;
            }

            public onPart(part: DicomPart): DicomPart[] {
                if (part instanceof ElementsPart && part.label === "fmigrouplength") {
                    const elements = part.elements;
                    if (elements.data.length > 0) {
                        const bigEndian = elements.data[0].bigEndian;
                        const explicitVR = elements.data[0].explicitVR;
                        const fmiElementsNoLength = elements.filter((e) =>
                            e.tag !== Tag.FileMetaInformationGroupLength);
                        const length = fmiElementsNoLength.data.map((e) =>
                            e.toBytes().length).reduce((l1, l2) => l1 + l2, 0);
                        const lengthHeader =
                            HeaderPart.create(Tag.FileMetaInformationGroupLength, VR.UL, 4, bigEndian, explicitVR);
                        const lengthChunk = new ValueChunk(bigEndian, base.intToBytes(length, bigEndian), true);
                        this.fmi = base.concatArrays([lengthHeader, lengthChunk], fmiElementsNoLength.toParts(false));
                    }
                    return [];
                }
                if (!this.hasEmitted && part.bytes.length > 0) {
                    this.hasEmitted = true;
                    return part instanceof PreamblePart
                        ? base.prependToArray(part, this.fmi)
                        : base.appendToArray(part, this.fmi);
                }
                return [part];
            }
        }()));
}

export function toIndeterminateLengthSequences() {
    return create(new class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {

        private indeterminateBytes = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);

        public onSequence(part: SequencePart): DicomPart[] {
            return super.onSequence(part).map((p: DicomPart) => {
                if (p instanceof SequencePart && !p.indeterminate) {
                    return new SequencePart(
                        part.tag,
                        base.indeterminateLength,
                        part.bigEndian,
                        part.explicitVR,
                        base.concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes));
                }
                return p;
            });
        }

        public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
            const out = super.onSequenceDelimitation(part);
            if (part.bytes.length <= 0) {
                out.push(new SequenceDelimitationPart(part.bigEndian, base.sequenceDelimitation(part.bigEndian)));
            }
            return out;
        }

        public onItem(part: ItemPart): DicomPart[] {
            return super.onItem(part).map((p: DicomPart) => {
                if (p instanceof ItemPart && !this.inFragments && !p.indeterminate) {
                    return new ItemPart(
                        part.index,
                        base.indeterminateLength,
                        part.bigEndian,
                        base.concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes));
                }
                return p;
            });
        }

        public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
            const out = super.onItemDelimitation(part);
            if (part.bytes.length <= 0) {
                out.push(new ItemDelimitationPart(part.index, part.bigEndian, base.itemDelimitation(part.bigEndian)));
            }
            return out;
        }
    }());
}

export function toUtf8Flow() {
    return pipe(
        collectFromTagPathsFlow([TagPath.fromTag(Tag.SpecificCharacterSet)], "toutf8"),
        modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.SpecificCharacterSet), () => Buffer.from("ISO_IR 192"))]),
        create(new class extends IdentityFlow {

            private characterSets: CharacterSets = base.defaultCharacterSet;
            private currentHeader: HeaderPart;
            private currentValue: Buffer = base.emptyBuffer;

            public onHeader(part: HeaderPart) {
                if (part.length > 0 && CharacterSets.isVrAffectedBySpecificCharacterSet(part.vr)) {
                    this.currentHeader = part;
                    this.currentValue = base.emptyBuffer;
                    return [];
                } else {
                    this.currentHeader = undefined;
                    return [part];
                }
            }

            public onValueChunk(part: ValueChunk) {
                if (this.currentHeader !== undefined) {
                    this.currentValue = base.concat(this.currentValue, part.bytes);
                    if (part.last) {
                        const newValue =
                            Buffer.from(this.characterSets.decode(this.currentValue, this.currentHeader.vr));
                        const newLength = newValue.length;
                        return [
                            this.currentHeader.withUpdatedLength(newLength),
                            new ValueChunk(this.currentHeader.bigEndian, newValue, true)];
                    } else {
                        return [];
                    }
                } else {
                    return [part];
                }
            }

            public onPart(part: DicomPart) {
                if (part instanceof ElementsPart && part.label === "toutf8") {
                    const csNames = part.elements.singleStringByTag(Tag.SpecificCharacterSet);
                    if (part.elements.contains(Tag.SpecificCharacterSet)) {
                        this.characterSets =
                            CharacterSets.fromBytes(part.elements.bytesByTag(Tag.SpecificCharacterSet));
                    }
                    return [];
                }
                return [part];
            }
        }()));
}

class DeflateDatasetFlow extends Detour {
    private collectingTs: boolean = false;
    private tsBytes: Buffer = base.emptyBuffer;

    constructor() {
        super({objectMode: true});
    }

    public process(part: DicomPart): void {
        if (part instanceof HeaderPart) {
            if (part.isFmi) {
                this.collectingTs = part.tag === Tag.TransferSyntaxUID;
                this.push(part);
            } else {
                if (this.tsBytes.toString().trim() === UID.DeflatedExplicitVRLittleEndian) {
                    const toDeflatedChunk = new Transform({
                        readableObjectMode: true,
                        transform(chunk, encoding, cb) {
                            this.push(new DeflatedChunk(false, chunk));
                            process.nextTick(() => cb());
                        },
                    });
                    this.setDetourFlow(pipe(toBytesFlow(), zlib.createDeflateRaw(), toDeflatedChunk));
                    this.setDetour(true, part);
                } else {
                    this.push(part);
                }
            }
        } else if (part instanceof ValueChunk && this.collectingTs) {
            this.tsBytes = base.concat(this.tsBytes, part.bytes);
            this.push(part);
        } else {
            this.push(part);
        }
    }
}
