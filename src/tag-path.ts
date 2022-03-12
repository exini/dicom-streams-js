import { tagToString } from './base';
import { Lookup } from './lookup';
import { TagPathLike } from './tag-path-like';

export class TagPath extends TagPathLike<TagPath> {
    public static fromTag(tag: number): TagPathTag {
        return emptyTagPath.thenTag(tag);
    }
    public static fromSequence(tag: number): TagPathSequence {
        return emptyTagPath.thenSequence(tag);
    }
    public static fromSequenceEnd(tag: number): TagPathSequenceEnd {
        return emptyTagPath.thenSequenceEnd(tag);
    }
    public static fromItem(tag: number, item: number): TagPathItem {
        return emptyTagPath.thenItem(tag, item);
    }
    public static fromItemEnd(tag: number, item: number): TagPathItemEnd {
        return emptyTagPath.thenItemEnd(tag, item);
    }

    public static parse(s: string): TagPath {
        const indexPart = (s1: string): string => s1.substring(s1.lastIndexOf('[') + 1, s1.length - 1);
        const tagPart = (s1: string): string => s1.substring(0, s1.indexOf('['));
        const parseTag = (s1: string): number => {
            const tag = Lookup.tagOf(s1);
            if (!tag) {
                if (s1.length === 11 && s1[0] === '(' && s1[5] === ',' && s1[10] === ')') {
                    const i = parseInt(s1.substring(1, 5) + s1.substring(6, 10), 16);
                    if (!isNaN(i)) {
                        return i;
                    }
                }
                throw Error(s1 + ' is not a tag or name string');
            }
            return tag;
        };
        const parseIndex = (s1: string): number => {
            const i = parseInt(s1, 10);
            if (isNaN(i)) {
                throw Error(s1 + ' is not a number');
            }
            return i;
        };
        const createTag = (s1: string): TagPathTag => TagPath.fromTag(parseTag(s1));
        const addTag = (s1: string, path: TagPathTrunk): TagPathTag => path.thenTag(parseTag(s1));
        const createSeq = (s1: string): TagPathItem =>
            TagPath.fromItem(parseTag(tagPart(s1)), parseIndex(indexPart(s1)));
        const addSeq = (s1: string, path: TagPathTrunk): TagPathItem =>
            path.thenItem(parseTag(tagPart(s1)), parseIndex(indexPart(s1)));

        const tags = s.indexOf('.') > 0 ? s.split('.') : [s];
        const seqTags = tags.length > 1 ? tags.slice(0, tags.length - 1) : []; // list of sequence tags, if any
        const lastTag = tags[tags.length - 1]; // tag or sequence
        try {
            const first = seqTags.length > 0 ? seqTags[0] : undefined;
            if (first) {
                const path = seqTags.slice(1, seqTags.length).reduce((p, tag) => addSeq(tag, p), createSeq(first));
                return addTag(lastTag, path);
            }
            return createTag(lastTag);
        } catch (error) {
            throw Error('Tag path could not be parsed: ' + error.message);
        }
    }

    private tagVal: number;
    private previousVal: TagPathTrunk;

    constructor(tag: number, previous: TagPathTrunk) {
        super();
        this.tagVal = tag;
        this.previousVal = previous;
    }

    public tag(): number {
        return this.tagVal;
    }

    public previous(): TagPathTrunk {
        return this.previousVal;
    }

    public isEmpty(): boolean {
        return this === (emptyTagPath as TagPath);
    }

    public isBelow(that: TagPath): boolean {
        const thisList = this.toList();
        const thatList = that.toList();

        for (let i = 0; i < Math.min(thisList.length, thatList.length); i++) {
            const thisPath = thisList[i];
            const thatPath = thatList[i];
            if (thisPath.isEmpty()) {
                return !thatPath.isEmpty();
            }
            if (thatPath.isEmpty()) {
                return false;
            }
            if (thisPath.tag() !== thatPath.tag()) {
                return thisPath.tag() < thatPath.tag();
            }
            if (thisPath instanceof TagPathSequence && 'item' in thatPath) {
                return true;
            }
            if (thisPath instanceof TagPathSequence && thatPath instanceof TagPathSequenceEnd) {
                return true;
            }
            if (thisPath instanceof TagPathSequenceEnd && 'item' in thatPath) {
                return false;
            }
            if (thisPath instanceof TagPathSequenceEnd && thatPath instanceof TagPathSequence) {
                return false;
            }
            if ('item' in thisPath && thatPath instanceof TagPathSequence) {
                return false;
            }
            if ('item' in thisPath && thatPath instanceof TagPathSequenceEnd) {
                return true;
            }
            if (
                'item' in thisPath &&
                'item' in thatPath &&
                (thisPath as unknown as ItemIndex).item !== (thatPath as unknown as ItemIndex).item
            ) {
                return (thisPath as unknown as ItemIndex).item < (thatPath as unknown as ItemIndex).item;
            }
            if (thisPath instanceof TagPathItem && thatPath instanceof TagPathItemEnd) {
                return true;
            }
            if (thisPath instanceof TagPathItemEnd && thatPath instanceof TagPathItem) {
                return false;
            }
        }
        return thisList.length < thatList.length;
    }

    public isEqualTo(that: TagPath): boolean {
        if (this.isEmpty() && that.isEmpty()) {
            return true;
        }
        if (this instanceof TagPathTag && that instanceof TagPathTag) {
            return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        }
        if (this instanceof TagPathSequence && that instanceof TagPathSequence) {
            return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        }
        if (this instanceof TagPathSequenceEnd && that instanceof TagPathSequenceEnd) {
            return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        }
        if (this instanceof TagPathItem && that instanceof TagPathItem) {
            return this.tag() === that.tag() && this.item === that.item && this.previous().isEqualTo(that.previous());
        }
        if (this instanceof TagPathItemEnd && that instanceof TagPathItemEnd) {
            return this.tag() === that.tag() && this.item === that.item && this.previous().isEqualTo(that.previous());
        }
        return false;
    }

    public startsWith(that: TagPath): boolean {
        const thisDepth = this.depth();
        const thatDepth = that.depth();
        if (thisDepth >= thatDepth) {
            const n = Math.min(thisDepth, thatDepth);
            return this.take(n).isEqualTo(that.take(n));
        } else {
            return false;
        }
    }

    public endsWith(that: TagPath): boolean {
        const n = this.depth() - that.depth();
        return n >= 0 ? this.drop(n).isEqualTo(that) : false;
    }

    public drop(n: number): TagPath {
        const dropRec = (path: TagPath, i: number): TagPath => {
            if (i < 0) {
                return emptyTagPath;
            }
            if (i === 0) {
                if (path.isEmpty()) {
                    return emptyTagPath;
                }
                if (path instanceof TagPathItem) {
                    return TagPath.fromItem(path.tag(), path.item);
                }
                if (path instanceof TagPathItemEnd) {
                    return TagPath.fromItemEnd(path.tag(), path.item);
                }
                if (path instanceof TagPathSequence) {
                    return TagPath.fromSequence(path.tag());
                }
                if (path instanceof TagPathSequenceEnd) {
                    return TagPath.fromSequenceEnd(path.tag());
                }
                return TagPath.fromTag(path.tag());
            }
            const p = dropRec(path.previous(), i - 1) as TagPathTrunk;
            if (path instanceof TagPathItem) {
                return p.thenItem(path.tag(), path.item);
            }
            if (path instanceof TagPathItemEnd) {
                return p.thenItemEnd(path.tag(), path.item);
            }
            if (path instanceof TagPathSequence) {
                return p.thenSequence(path.tag());
            }
            if (path instanceof TagPathSequenceEnd) {
                return p.thenSequenceEnd(path.tag());
            }
            if (path instanceof TagPathTag) {
                return p.thenTag(path.tag());
            }
            return emptyTagPath;
        };
        return dropRec(this, this.depth() - n - 1);
    }

    public toNamedString(lookup: boolean): string {
        const toTagString = (tag: number): string => {
            if (lookup) {
                const keyword = Lookup.keywordOf(tag);
                if (keyword) {
                    return keyword;
                }
            }
            return tagToString(tag);
        };
        const toTagPathString = (path: TagPath, tail: string): string => {
            const itemIndexSuffix = 'item' in path ? '[' + (path as unknown as ItemIndex).item + ']' : '';
            const head = toTagString(path.tag()) + itemIndexSuffix;
            const part = head + tail;
            return path.isRoot() ? part : toTagPathString(path.previous(), '.' + part);
        };
        return this.isEmpty() ? '<empty path>' : toTagPathString(this, '');
    }
}

interface ItemIndex {
    item: number;
}

export class TagPathTrunk extends TagPath {
    public thenTag(tag: number): TagPathTag {
        return new TagPathTag(tag, this);
    }
    public thenSequence(tag: number): TagPathSequence {
        return new TagPathSequence(tag, this);
    }
    public thenSequenceEnd(tag: number): TagPathSequenceEnd {
        return new TagPathSequenceEnd(tag, this);
    }
    public thenItem(tag: number, item: number): TagPathItem {
        return new TagPathItem(tag, item, this);
    }
    public thenItemEnd(tag: number, item: number): TagPathItemEnd {
        return new TagPathItemEnd(tag, item, this);
    }
}

class EmptyTagPath extends TagPathTrunk {
    public tag(): number {
        throw Error('Empty tag path');
    }
    public previous(): TagPathTrunk {
        return emptyTagPath;
    }
}
export const emptyTagPath = new EmptyTagPath(-1, null);

export class TagPathTag extends TagPath {
    constructor(tag: number, previous: TagPathTrunk) {
        super(tag, previous);
    }
}

export class TagPathSequence extends TagPath {
    constructor(tag: number, previous: TagPathTrunk) {
        super(tag, previous);
    }
}

export class TagPathSequenceEnd extends TagPath {
    constructor(tag: number, previous: TagPathTrunk) {
        super(tag, previous);
    }
}

export class TagPathItem extends TagPathTrunk implements ItemIndex {
    constructor(tag: number, public readonly item: number, previous: TagPathTrunk) {
        super(tag, previous);
    }
}

export class TagPathItemEnd extends TagPathTrunk implements ItemIndex {
    constructor(tag: number, public readonly item: number, previous: TagPathTrunk) {
        super(tag, previous);
    }
}
