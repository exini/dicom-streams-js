import * as base from "./base";
import * as Lookup from "./lookup";
import {TagPath, TagPathItem, TagPathItemEnd, TagPathSequence, TagPathSequenceEnd, TagPathTag} from "./tag-path";
import {TagPathLike} from "./tag-path-like";

// tslint:disable: max-classes-per-file

type ItemPath = TagPathItem | TagPathItemEnd;

export class TagTree extends TagPathLike<TagTree> {

    public static fromTag(tag: number): TagTreeTag { return emptyTagTree.thenTag(tag); }
    public static fromAnyItem(tag: number): TagTreeAnyItem { return emptyTagTree.thenAnyItem(tag); }
    public static fromItem(tag: number, item: number): TagTreeItem { return emptyTagTree.thenItem(tag, item); }

    public static fromPath(tagPath: TagPath): TagTree {
        let root: TagTree;
        const p = tagPath.head();
        if (p instanceof TagPathTag) { root = TagTree.fromTag(p.tag()); } else
        if (p instanceof TagPathItem) { root = TagTree.fromItem(p.tag(), p.item); } else
        if (p instanceof TagPathItemEnd) { root = TagTree.fromItem(p.tag(), p.item); } else
        if (p instanceof TagPathSequence) { root = TagTree.fromAnyItem(p.tag()); } else
        if (p instanceof TagPathSequenceEnd) { root = TagTree.fromAnyItem(p.tag()); } else {
            root = emptyTagTree;
        }
        return tagPath.drop(1).toList().reduce((t, p1) => {
            if (t instanceof TagTreeTrunk && p1 instanceof TagPathTag) { return t.thenTag(p1.tag()); }
            if (t instanceof TagTreeTrunk && p1 instanceof TagPathItem) { return t.thenItem(p1.tag(), p1.item); }
            if (t instanceof TagTreeTrunk && p1 instanceof TagPathItemEnd) { return t.thenItem(p1.tag(), p1.item); }
            if (t instanceof TagTreeTrunk && p1 instanceof TagPathSequence) { return t.thenAnyItem(p1.tag()); }
            if (t instanceof TagTreeTrunk && p1 instanceof TagPathSequenceEnd) { return t.thenAnyItem(p1.tag()); }
            return t;
        }, root);
    }

    public static parse(str: string): TagTree {
        const isSeq = (s: string) => s[s.length - 1] === "]";
        const indexPart = (s: string) => s.substring(s.lastIndexOf("[") + 1, s.length - 1);
        const tagPart = (s: string) => s.substring(0, s.indexOf("["));
        const parseTag = (s: string) => {
            try {
                return Lookup.tagOf(s);
            } catch (error) {
                if (s.length === 11 && s[0] === "(" && s[5] === "," && s[10] === ")") {
                    const i = parseInt(s.substring(1, 5) + s.substring(6, 10), 16);
                    if (!isNaN(i)) { return i; }
                }
                throw Error(s + " is not a tag or name string");
            }
        };
        const parseIndex = (s: string) => {
            if (s === "*") { return undefined; }
            const i = parseInt(s, 10);
            if (isNaN(i)) { throw Error(s + " is not a number"); }
            return i;
        };
        const createTag = (s: string) => TagTree.fromTag(parseTag(s));
        const addTag = (s: string, path: TagTreeTrunk) => path.thenTag(parseTag(s));
        const createSeq = (s: string): TagTreeTrunk => {
            const tag = parseTag(tagPart(s));
            const index = parseIndex(indexPart(s));
            return index === undefined ? TagTree.fromAnyItem(tag) : TagTree.fromItem(tag, index);
        };
        const addSeq = (s: string, path: TagTreeTrunk): TagTreeTrunk => {
            const tag = parseTag(tagPart(s));
            const index = parseIndex(indexPart(s));
            return index === undefined ? path.thenAnyItem(tag) : path.thenItem(tag, index);
        };

        const tags = str.indexOf(".") > 0 ? str.split(".") : [str];
        const seqTags = tags.length > 1 ? tags.slice(0, tags.length - 1) : []; // list of sequence tags, if any
        const lastTag = tags[tags.length - 1]; // tag or sequence
        try {
            const first = seqTags.length > 0 ? seqTags[0] : undefined;
            if (first) {
                const tree = seqTags.slice(1, seqTags.length)
                    .reduce((tr: TagTreeTrunk, tag: string) => addSeq(tag, tr), createSeq(first));
                if (tree !== undefined) {
                    return isSeq(lastTag) ? addSeq(lastTag, tree) : addTag(lastTag, tree);
                }
                return isSeq(lastTag) ? createSeq(lastTag) : createTag(lastTag);
            }
            return createTag(lastTag);
        } catch (error) {
            throw Error("Tag tree could not be parsed: " + error.message);
        }
    }

    private tagVal: number;
    private previousVal: TagTreeTrunk;
    constructor(tag: number, previous: TagTreeTrunk) {
        super();
        this.tagVal = tag;
        this.previousVal = previous;
    }

    public tag(): number { return this.tagVal; }

    public previous(): TagTreeTrunk { return this.previousVal; }

    public isEmpty(): boolean { return this === (emptyTagTree as TagTree); }

    public isEqualTo(that: TagTree): boolean {
        if (this.isEmpty() && that.isEmpty()) { return true; }
        if (this instanceof TagTreeTag && that instanceof TagTreeTag) {
            return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        }
        if (this instanceof TagTreeItem && that instanceof TagTreeItem) {
            return this.tag() === that.tag() && this.item === that.item && this.previous().isEqualTo(that.previous());
        }
        if (this instanceof TagTreeAnyItem && that instanceof TagTreeAnyItem) {
            return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        }
        return false;
    }

    public isPath(): boolean {
        if (this.isEmpty()) { return true; }
        if (this instanceof TagTreeAnyItem) { return false; }
        return this.previous().isPath();
    }

    public hasPath(tagPath: TagPath): boolean {
        if (this.isEmpty() && tagPath.isEmpty()) { return true; }
        if (this instanceof TagTreeTag && tagPath instanceof TagPathTag) {
            return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        }
        if (this instanceof TagTreeItem && "item" in tagPath) {
            return this.item === (tagPath as ItemPath).item &&
                this.tag() === (tagPath as ItemPath).tag() &&
                this.previous().hasPath((tagPath as ItemPath).previous());
        }
        if (this instanceof TagTreeAnyItem && "item" in tagPath) {
            return this.tag() === (tagPath as ItemPath).tag() &&
                this.previous().hasPath((tagPath as ItemPath).previous());
        }
        if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequence) {
            return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        }
        if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequenceEnd) {
            return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        }
        return false;
    }

    public hasTrunk(tagPath: TagPath): boolean {
        if (this.depth() >= tagPath.depth()) {
            const thisList = this.toList();
            const thatList = tagPath.toList();

            for (let i = 0; i < Math.min(thisList.length, thatList.length); i++) {
                const t = thisList[i];
                const p = thatList[i];

                let check = false;
                if (p.isEmpty()) { check = true; } else
                if (t instanceof TagTreeItem && "item" in p) {
                    check = t.tag() === (p as ItemPath).tag() &&
                        t.item === (p as ItemPath).item;
                } else
                if (t instanceof TagTreeItem && p instanceof TagPathSequence) { check = t.tag() === p.tag(); } else
                if (t instanceof TagTreeItem && p instanceof TagPathSequenceEnd) { check = t.tag() === p.tag(); } else
                if (t instanceof TagTreeAnyItem && (p as ItemPath).item !== undefined) {
                    check = t.tag() === p.tag();
                } else
                if (t instanceof TagTreeAnyItem && p instanceof TagPathSequence) { check = t.tag() === p.tag(); } else
                if (t instanceof TagTreeAnyItem && p instanceof TagPathSequenceEnd) {
                    check = t.tag() === p.tag();
                } else if (t instanceof TagTreeTag && p instanceof TagPathTag) { check = t.tag() === p.tag(); }
                if (!check) { return false; }
            }
            return true;
        } else {
            return false;
        }
    }

    public isTrunkOf(tagPath: TagPath): boolean {
        if (this.depth() <= tagPath.depth()) {
            const thisList = this.toList();
            const thatList = tagPath.toList();

            for (let i = 0; i < Math.min(thisList.length, thatList.length); i++) {
                const t = thisList[i];
                const p = thatList[i];

                let check = false;
                if (p.isEmpty()) { check = true; } else
                if (t instanceof TagTreeItem && "item" in p) {
                    check = t.tag() === (p as ItemPath).tag() && t.item === (p as ItemPath).item;
                } else
                if (t instanceof TagTreeAnyItem && "item" in p) { check = t.tag() === (p as ItemPath).tag(); } else
                if (t instanceof TagTreeAnyItem && p instanceof TagPathSequence) { check = t.tag() === p.tag(); } else
                if (t instanceof TagTreeAnyItem && p instanceof TagPathSequenceEnd) {
                    check = t.tag() === p.tag();
                } else
                if (t instanceof TagTreeTag && p instanceof TagPathTag) { check = t.tag() === p.tag(); }
                if (!check) { return false; }
            }
            return true;
        } else {
            return false;
        }
    }

    public hasTwig(tagPath: TagPath): boolean {
        let check = false;
        if (this.isEmpty() && tagPath.isEmpty()) { check = true; } else
        if (this instanceof TagTreeAnyItem && "item" in tagPath) {
            check = this.tag() === (tagPath as ItemPath).tag();
        } else
        if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequence) {
            check = this.tag() === tagPath.tag();
        } else
        if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequenceEnd) {
            check = this.tag() === tagPath.tag();
        } else
        if (this instanceof TagTreeItem && "item" in tagPath) {
            check = this.tag() === (tagPath as ItemPath).tag() && this.item === (tagPath as ItemPath).item;
        } else
        if (this instanceof TagTreeTag && tagPath instanceof TagPathTag) { check = this.tag() === tagPath.tag(); }

        if (tagPath.previous().isEmpty()) { return check; } else
        if (this.previous().isEmpty()) { return false; }
        return check && this.previous().hasTwig(tagPath.previous());
    }

    public drop(n: number): TagTree {
        const dropRec = (tree: TagTree, i: number): TagTree => {
            if (i < 0) {
                return emptyTagTree;
            }
            if (i === 0) {
                if (tree.isEmpty()) { return emptyTagTree; }
                if (tree instanceof TagTreeItem) { return TagTree.fromItem(tree.tag(), tree.item); }
                if (tree instanceof TagTreeAnyItem) { return TagTree.fromAnyItem(tree.tag()); }
                return TagTree.fromTag(tree.tag());
            }
            const t = dropRec(tree.previous(), i - 1);
            if (tree instanceof TagTreeItem) { return (t as TagTreeTrunk).thenItem(tree.tag(), tree.item); }
            if (tree instanceof TagTreeAnyItem) { return (t as TagTreeTrunk).thenAnyItem(tree.tag()); }
            if (tree instanceof TagTreeTag) { return (t as TagTreeTrunk).thenTag(tree.tag()); }
            return emptyTagTree;
        };
        return dropRec(this, this.depth() - n - 1);
    }

    public toNamedString(lookup: boolean): string {
        const toTagString = (tag: number): string => {
            if (lookup) {
                const keyword = Lookup.keywordOf(tag);
                if (keyword.length > 0) { return keyword; }
            }
            return base.tagToString(tag);
        };
        const toTagTreeString = (tree: TagTree, tail: string): string => {
            const itemIndexSuffix = tree instanceof TagTreeAnyItem ? "[*]" :
                "item" in tree ? "[" + (tree as ItemPath).item + "]" : "";
            const head = toTagString(tree.tag()) + itemIndexSuffix;
            const part = head + tail;
            return tree.isRoot() ? part : toTagTreeString(tree.previous(), "." + part);
        };
        return this.isEmpty() ? "<empty tree>" : toTagTreeString(this, "");
    }
}

export class TagTreeTrunk extends TagTree {
    public thenTag(tag: number) { return new TagTreeTag(tag, this); }
    public thenAnyItem(tag: number) { return new TagTreeAnyItem(tag, this); }
    public thenItem(tag: number, item: number) { return new TagTreeItem(tag, item, this); }
}

class EmptyTagTree extends TagTreeTrunk {
    public tag(): number { throw Error("Empty tag tree"); }
    public previous(): TagTreeTrunk { return emptyTagTree; }
}
export const emptyTagTree = new EmptyTagTree(-1, null);

export class TagTreeTag extends TagTree {
    constructor(tag: number, previous: TagTreeTrunk) {
        super(tag, previous);
    }
}

export class TagTreeAnyItem extends TagTreeTrunk {
    constructor(tag: number, previous: TagTreeTrunk) {
        super(tag, previous);
    }
}

export class TagTreeItem extends TagTreeTrunk {
    constructor(tag: number, public readonly item: number, previous: TagTreeTrunk) {
        super(tag, previous);
    }
}
