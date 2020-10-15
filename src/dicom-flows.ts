import { Transform } from 'stream';
import zlib from 'zlib';
import {
    appendToArray,
    concat,
    concatArrays,
    emptyBuffer,
    indeterminateLength,
    intToBytes,
    isFileMetaInformation,
    isGroupLength,
    itemDelimitation,
    pipe,
    prependToArray,
    sequenceDelimitation,
} from './base';
import { CharacterSets, defaultCharacterSet } from './character-sets';
import { collectFlow, collectFromTagPathsFlow } from './collect-flow';
import { Detour } from './detour';
import {
    createFlow,
    DeferToPartFlow,
    dicomEndMarker,
    EndEvent,
    GroupLengthWarnings,
    GuaranteedDelimitationEvents,
    GuaranteedValueEvent,
    IdentityFlow,
    InFragments,
    InSequence,
    TagPathTracking,
} from './dicom-flow';
import { modifyFlow, TagInsertion } from './modify-flow';
import {
    DeflatedChunk,
    DicomPart,
    ElementsPart,
    HeaderPart,
    ItemDelimitationPart,
    ItemPart,
    PreamblePart,
    SequenceDelimitationPart,
    SequencePart,
    ValueChunk,
} from './dicom-parts';
import { Tag } from './tag';
import { TagPath } from './tag-path';
import { emptyTagPath } from './tag-path';
import { TagTree } from './tag-tree';
import { UID } from './uid';
import { VR } from './vr';

export function toBytesFlow(): Transform {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback): void {
            this.push(chunk.bytes);
            process.nextTick(() => callback());
        },
    });
}

export function stopTagFlow(tag: number): any {
    let endReached = false;

    return pipe(
        createFlow(
            new (class extends InSequence(GuaranteedDelimitationEvents(InFragments(IdentityFlow))) {
                public onHeader(part: HeaderPart): DicomPart[] {
                    const out = super.onHeader(part);
                    return this.inSequence || part.tag < tag ? out : [dicomEndMarker];
                }
            })(),
        ),
        new Transform({
            objectMode: true,
            transform(chunk, encoding, callback): void {
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

export function tagFilter(
    keepCondition: (t: TagPath) => boolean,
    defaultCondition: (p: DicomPart) => boolean = (): boolean => true,
    logGroupLengthWarnings = false,
): any {
    return createFlow(
        new (class extends TagPathTracking(
            GuaranteedDelimitationEvents(GuaranteedValueEvent(GroupLengthWarnings(InFragments(DeferToPartFlow)))),
        ) {
            private keeping = false;

            constructor() {
                super();
                this.setSilent(!logGroupLengthWarnings);
            }

            public onPart(part: DicomPart): DicomPart[] {
                this.keeping = this.tagPath === emptyTagPath ? defaultCondition(part) : keepCondition(this.tagPath);
                return this.keeping ? [part] : [];
            }
        })(),
    );
}

export function allowFilter(
    allowlist: TagTree[],
    defaultCondition?: (p: DicomPart) => boolean,
    logGroupLengthWarnings?: boolean,
): any {
    return tagFilter(
        (currentPath) => allowlist.some((t) => t.hasTrunk(currentPath) || t.isTrunkOf(currentPath)),
        defaultCondition,
        logGroupLengthWarnings,
    );
}

export function denyFilter(
    denylist: TagTree[],
    defaultCondition?: (p: DicomPart) => boolean,
    logGroupLengthWarnings?: boolean,
): any {
    return tagFilter(
        (currentPath) => !denylist.some((t) => t.isTrunkOf(currentPath)),
        defaultCondition,
        logGroupLengthWarnings,
    );
}

export function groupLengthDiscardFilter(): any {
    return tagFilter((tagPath) => !isGroupLength(tagPath.tag()) || isFileMetaInformation(tagPath.tag()));
}

export function fmiDiscardFilter(): any {
    return tagFilter(
        (tagPath) => !isFileMetaInformation(tagPath.tag()),
        () => false,
    );
}

export function headerFilter(keepCondition: (p: HeaderPart) => boolean, logGroupLengthWarnings = false): any {
    return createFlow(
        new (class extends GroupLengthWarnings(InFragments(DeferToPartFlow)) {
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
        })(),
    );
}

export class ValidationContext {
    constructor(public readonly sopClassUID: string, public readonly transferSyntaxUID: string) {}
}

export function validateContextFlow(contexts: ValidationContext[]): any {
    return pipe(
        collectFromTagPathsFlow(
            [
                TagTree.fromTag(Tag.MediaStorageSOPClassUID),
                TagTree.fromTag(Tag.TransferSyntaxUID),
                TagTree.fromTag(Tag.SOPClassUID),
            ],
            'validatecontext',
        ),
        createFlow(
            new (class extends DeferToPartFlow {
                public onPart(part: DicomPart): DicomPart[] {
                    if (part instanceof ElementsPart && part.label === 'validatecontext') {
                        let scuid = part.elements.stringByTag(Tag.MediaStorageSOPClassUID);
                        if (scuid === undefined) {
                            scuid = part.elements.stringByTag(Tag.SOPClassUID);
                        }
                        if (scuid === undefined) {
                            scuid = '<empty>';
                        }
                        let tsuid = part.elements.stringByTag(Tag.TransferSyntaxUID);
                        if (tsuid === undefined) {
                            tsuid = '<empty>';
                        }
                        if (contexts.findIndex((c) => c.sopClassUID === scuid && c.transferSyntaxUID === tsuid) >= 0) {
                            return [];
                        } else {
                            throw Error(
                                'The presentation context [SOPClassUID = ' +
                                    scuid +
                                    ', TransferSyntaxUID = ' +
                                    tsuid +
                                    '] is not supported',
                            );
                        }
                    }
                    return [part];
                }
            })(),
        ),
    );
}

export function fmiGroupLengthFlow(): any {
    return pipe(
        collectFlow(
            (tagPath) => tagPath.isRoot() && isFileMetaInformation(tagPath.tag()),
            (tagPath) => !isFileMetaInformation(tagPath.tag()),
            'fmigrouplength',
        ),
        tagFilter(
            (tagPath) => !isFileMetaInformation(tagPath.tag()),
            () => true,
            false,
        ),
        createFlow(
            new (class extends EndEvent(DeferToPartFlow) {
                private fmi: DicomPart[] = [];
                private hasEmitted = false;

                public onEnd(): DicomPart[] {
                    return this.hasEmitted ? [] : this.fmi;
                }

                public onPart(part: DicomPart): DicomPart[] {
                    if (part instanceof ElementsPart && part.label === 'fmigrouplength') {
                        const elements = part.elements;
                        if (elements.data.length > 0) {
                            const bigEndian = elements.data[0].bigEndian;
                            const explicitVR = elements.data[0].explicitVR;
                            const fmiElementsNoLength = elements.filter(
                                (e) => e.tag !== Tag.FileMetaInformationGroupLength,
                            );
                            const length = fmiElementsNoLength.data
                                .map((e) => e.toBytes().length)
                                .reduce((l1, l2) => l1 + l2, 0);
                            const lengthHeader = HeaderPart.create(
                                Tag.FileMetaInformationGroupLength,
                                VR.UL,
                                4,
                                bigEndian,
                                explicitVR,
                            );
                            const lengthChunk = new ValueChunk(bigEndian, intToBytes(length, bigEndian), true);
                            this.fmi = concatArrays([lengthHeader, lengthChunk], fmiElementsNoLength.toParts(false));
                        }
                        return [];
                    }
                    if (!this.hasEmitted && part.bytes.length > 0) {
                        this.hasEmitted = true;
                        return part instanceof PreamblePart
                            ? prependToArray(part, this.fmi)
                            : appendToArray(part, this.fmi);
                    }
                    return [part];
                }
            })(),
        ),
    );
}

export function toIndeterminateLengthSequences(): any {
    return createFlow(
        new (class extends GuaranteedDelimitationEvents(InFragments(IdentityFlow)) {
            private indeterminateBytes = Buffer.from([0xff, 0xff, 0xff, 0xff]);

            public onSequence(part: SequencePart): DicomPart[] {
                return super.onSequence(part).map((p: DicomPart) => {
                    if (p instanceof SequencePart && !p.indeterminate) {
                        return new SequencePart(
                            part.tag,
                            indeterminateLength,
                            part.bigEndian,
                            part.explicitVR,
                            concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes),
                        );
                    }
                    return p;
                });
            }

            public onSequenceDelimitation(part: SequenceDelimitationPart): DicomPart[] {
                const out = super.onSequenceDelimitation(part);
                if (part.bytes.length <= 0) {
                    out.push(new SequenceDelimitationPart(part.bigEndian, sequenceDelimitation(part.bigEndian)));
                }
                return out;
            }

            public onItem(part: ItemPart): DicomPart[] {
                return super.onItem(part).map((p: DicomPart) => {
                    if (p instanceof ItemPart && !this.inFragments && !p.indeterminate) {
                        return new ItemPart(
                            part.index,
                            indeterminateLength,
                            part.bigEndian,
                            concat(part.bytes.slice(0, part.bytes.length - 4), this.indeterminateBytes),
                        );
                    }
                    return p;
                });
            }

            public onItemDelimitation(part: ItemDelimitationPart): DicomPart[] {
                const out = super.onItemDelimitation(part);
                if (part.bytes.length <= 0) {
                    out.push(new ItemDelimitationPart(part.index, part.bigEndian, itemDelimitation(part.bigEndian)));
                }
                return out;
            }
        })(),
    );
}

export function toUtf8Flow(): any {
    return pipe(
        collectFromTagPathsFlow([TagTree.fromTag(Tag.SpecificCharacterSet)], 'toutf8'),
        modifyFlow([], [new TagInsertion(TagPath.fromTag(Tag.SpecificCharacterSet), () => Buffer.from('ISO_IR 192'))]),
        createFlow(
            new (class extends IdentityFlow {
                private characterSets: CharacterSets = defaultCharacterSet;
                private currentHeader: HeaderPart;
                private currentValue: Buffer = emptyBuffer;

                public onHeader(part: HeaderPart): DicomPart[] {
                    if (part.length > 0 && CharacterSets.isVrAffectedBySpecificCharacterSet(part.vr)) {
                        this.currentHeader = part;
                        this.currentValue = emptyBuffer;
                        return [];
                    } else {
                        this.currentHeader = undefined;
                        return [part];
                    }
                }

                public onValueChunk(part: ValueChunk): DicomPart[] {
                    if (this.currentHeader !== undefined) {
                        this.currentValue = concat(this.currentValue, part.bytes);
                        if (part.last) {
                            const newValue = Buffer.from(
                                this.characterSets.decode(this.currentValue, this.currentHeader.vr),
                            );
                            const newLength = newValue.length;
                            return [
                                this.currentHeader.withUpdatedLength(newLength),
                                new ValueChunk(this.currentHeader.bigEndian, newValue, true),
                            ];
                        } else {
                            return [];
                        }
                    } else {
                        return [part];
                    }
                }

                public onPart(part: DicomPart): DicomPart[] {
                    if (part instanceof ElementsPart && part.label === 'toutf8') {
                        if (part.elements.contains(Tag.SpecificCharacterSet)) {
                            this.characterSets = CharacterSets.fromBytes(
                                part.elements.bytesByTag(Tag.SpecificCharacterSet),
                            );
                        }
                        return [];
                    }
                    return [part];
                }
            })(),
        ),
    );
}

class DeflateDatasetFlow extends Detour {
    private collectingTs = false;
    private tsBytes: Buffer = emptyBuffer;

    constructor() {
        super({ objectMode: true });
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
                        transform(chunk, encoding, cb): void {
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
            this.tsBytes = concat(this.tsBytes, part.bytes);
            this.push(part);
        } else {
            this.push(part);
        }
    }
}
export function deflateDatasetFlow(): DeflateDatasetFlow {
    return new DeflateDatasetFlow();
}
