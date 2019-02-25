const {TagPathLike} = require("./tag-path-like");
const {TagPathTag, TagPathItem, TagPathItemEnd, TagPathSequence, TagPathSequenceEnd} = require("./tag-path");
const base = require("./base");
const dictionary = require("./dictionary");

class TagTree extends TagPathLike {
    constructor(tag, previous) {
        super();
        this._tag = tag;
        this._previous = previous;
    }

    tag() { return this._tag; }

    previous() { return this._previous; };

    isEmpty() { return this === emptyTagTree; }

    isEqualTo(that) {
        if (this.isEmpty() && that.isEmpty()) return true;
        if (this instanceof TagTreeTag && that instanceof TagTreeTag) return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        if (this instanceof TagTreeItem && that instanceof TagTreeItem) return this.tag() === that.tag() && this.item === that.item && this.previous().isEqualTo(that.previous());
        if (this instanceof TagTreeAnyItem && that instanceof TagTreeAnyItem) return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        return false;
    }

    isPath() {
        if (this.isEmpty()) return true;
        if (this instanceof TagTreeAnyItem) return false;
        return this.previous().isPath();
    }

    hasPath(tagPath) {
        if (this.isEmpty() && tagPath.isEmpty()) return  true;
        if (this instanceof TagTreeTag && tagPath instanceof TagPathTag) return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        if (this instanceof TagTreeItem && tagPath.item !== undefined) return this.item === tagPath.item && this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        if (this instanceof TagTreeAnyItem && tagPath.item !== undefined) return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequence) return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequenceEnd) return this.tag() === tagPath.tag() && this.previous().hasPath(tagPath.previous());
        return false;
    }

    hasTrunk(tagPath) {
        if (this.depth() >= tagPath.depth()) {
            let thisList = this.toList();
            let thatList = tagPath.toList();

            for (let i = 0; i < Math.min(thisList.length, thatList.length); i++) {
                let t = thisList[i];
                let p = thatList[i];

                let check = false;
                if (p.isEmpty()) check = true;
                else if (t instanceof TagTreeItem && p.item !== undefined) check = t.tag() === p.tag() && t.item === p.item;
                else if (t instanceof TagTreeItem && p instanceof TagPathSequence) check = t.tag() === p.tag();
                else if (t instanceof TagTreeItem && p instanceof TagPathSequenceEnd) check = t.tag() === p.tag();
                else if (t instanceof TagTreeAnyItem && p.item !== undefined) check = t.tag() === p.tag();
                else if (t instanceof TagTreeAnyItem && p instanceof TagPathSequence) check = t.tag() === p.tag();
                else if (t instanceof TagTreeAnyItem && p instanceof TagPathSequenceEnd) check = t.tag() === p.tag();
                else if (t instanceof TagTreeTag && p instanceof TagPathTag) check = t.tag() === p.tag();
                if (!check) return false;
            }
            return true;
        } else
            return false;
    }

    isTrunkOf(tagPath) {
        if (this.depth() <= tagPath.depth()) {
            let thisList = this.toList();
            let thatList = tagPath.toList();

            for (let i = 0; i < Math.min(thisList.length, thatList.length); i++) {
                let t = thisList[i];
                let p = thatList[i];

                let check = false;
                if (p.isEmpty()) check = true;
                else if (t instanceof TagTreeItem && p.item !== undefined) check = t.tag() === p.tag() && t.item === p.item;
                else if (t instanceof TagTreeAnyItem && p.item !== undefined) check = t.tag() === p.tag();
                else if (t instanceof TagTreeAnyItem && p instanceof TagPathSequence) check = t.tag() === p.tag();
                else if (t instanceof TagTreeAnyItem && p instanceof TagPathSequenceEnd) check = t.tag() === p.tag();
                else if (t instanceof TagTreeTag && p instanceof TagPathTag) check = t.tag() === p.tag();
                if (!check) return false;
            }
            return true;
        } else
            return false;
    }

    hasTwig(tagPath) {
        let check = false;
        if (this.isEmpty() && tagPath.isEmpty()) check = true;
        else if (this instanceof TagTreeAnyItem && tagPath.item !== undefined) check = this.tag() === tagPath.tag();
        else if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequence) check = this.tag() === tagPath.tag();
        else if (this instanceof TagTreeAnyItem && tagPath instanceof TagPathSequenceEnd) check = this.tag() === tagPath.tag();
        else if (this instanceof TagTreeItem && tagPath.item !== undefined) check = this.tag() === tagPath.tag() && this.item === tagPath.item;
        else if (this instanceof TagTreeTag && tagPath instanceof TagPathTag) check = this.tag() === tagPath.tag();

        if (tagPath.previous().isEmpty()) return check;
        else if (this.previous().isEmpty()) return false;
        return check && this.previous().hasTwig(tagPath.previous());
    }

    drop(n) {
        let dropRec = function(tree, i) {
            if (i < 0)
                return emptyTagTree;
            if (i === 0) {
                if (tree.isEmpty()) return emptyTagTree;
                if (tree instanceof TagTreeItem) return fromItem(tree.tag(), tree.item);
                if (tree instanceof TagTreeAnyItem) return fromAnyItem(tree.tag());
                return fromTag(tree.tag());
            }
            let t = dropRec(tree.previous(), i - 1);
            if (tree instanceof TagTreeItem) return t.thenItem(tree.tag(), tree.item);
            if (tree instanceof TagTreeAnyItem) return t.thenAnyItem(tree.tag());
            if (tree instanceof TagTreeTag) return t.thenTag(tree.tag());
            return emptyTagTree;
        };
        return dropRec(this, this.depth() - n - 1);
    }

    toNamedString(lookup) {
        let toTagString = function(tag) {
            if (lookup) {
                let keyword = dictionary.keywordOf(tag);
                if (keyword.length > 0) return keyword;
            }
            return base.tagToString(tag);
        };
        let toTagTreeString = function(tree, tail) {
            let itemIndexSuffix = tree instanceof TagTreeAnyItem ? "[*]" : tree.item !== undefined ? "[" + tree.item + "]" : "";
            let head = toTagString(tree.tag()) + itemIndexSuffix;
            let part = head + tail;
            return tree.isRoot() ? part : toTagTreeString(tree.previous(), "." + part);
        };
        return this.isEmpty() ? "<empty tree>" : toTagTreeString(this, "");
    }
}

class TagTreeTrunk extends TagTree {
    thenTag(tag) { return new TagTreeTag(tag, this); }
    thenAnyItem(tag) { return new TagTreeAnyItem(tag, this); }
    thenItem(tag, item) { return new TagTreeItem(tag, item, this); }
}

const emptyTagTree = new class extends TagTreeTrunk {
    tag() { throw new Error("Empty tag tree"); }
    previous() { return emptyTagTree; }
}();

class TagTreeTag extends TagTree {
    constructor(tag, previous) {
        super(tag, previous);
    }
}

class TagTreeAnyItem extends TagTreeTrunk {
    constructor(tag, previous) {
        super(tag, previous);
    }
}

class TagTreeItem extends TagTreeTrunk {
    constructor(tag, item, previous) {
        super(tag, previous);
        this.item = item;
    }
}

const fromTag = function(tag) { return emptyTagTree.thenTag(tag); };
const fromAnyItem = function(tag) { return emptyTagTree.thenAnyItem(tag) };
const fromItem = function(tag, item) { return emptyTagTree.thenItem(tag, item) };

const fromPath = function(tagPath) {
    let root = undefined;
    let p = tagPath.head();
    if (p instanceof TagPathTag) root = fromTag(p.tag());
    else if (p instanceof TagPathItem) root = fromItem(p.tag(), p.item);
    else if (p instanceof TagPathItemEnd) root = fromItem(p.tag(), p.item);
    else if (p instanceof TagPathSequence) root = fromAnyItem(p.tag());
    else if (p instanceof TagPathSequenceEnd) root = fromAnyItem(p.tag());
    else root = emptyTagTree;

    return tagPath.drop(1).toList().reduce((t, p) => {
        if (t instanceof TagTreeTrunk && p instanceof TagPathTag) return t.thenTag(p.tag());
        if (t instanceof TagTreeTrunk && p instanceof TagPathItem) return t.thenItem(p.tag(), p.item);
        if (t instanceof TagTreeTrunk && p instanceof TagPathItemEnd) return t.thenItem(p.tag(), p.item);
        if (t instanceof TagTreeTrunk && p instanceof TagPathSequence) return t.thenAnyItem(p.tag());
        if (t instanceof TagTreeTrunk && p instanceof TagPathSequenceEnd) return t.thenAnyItem(p.tag());
        return t;
    }, root);
};

const parse = function(s) {
    let isSeq = function(s) { return s[s.length - 1] === "]"; };
    let indexPart = function(s) { return s.substring(s.lastIndexOf("[") + 1, s.length - 1); };
    let tagPart = function(s) { return s.substring(0, s.indexOf("[")); };
    let parseTag = function(s) {
        try {
            return dictionary.tagOf(s);
        } catch (error) {
            if (s.length === 11 && s[0] === "(" && s[5] === "," && s[10] === ")") {
                let i = parseInt(s.substring(1, 5) + s.substring(6, 10), 16);
                if (!isNaN(i)) return i;
            }
            throw new Error(s + " is not a tag or name string");
        }
    };
    let parseIndex = function(s) {
        if (s === "*") return undefined;
        let i = parseInt(s);
        if (isNaN(i)) throw new Error(s + " is not a number");
        return i;
    };
    let createTag = function(s) { return fromTag(parseTag(s)); };
    let addTag = function(s, path) { return path.thenTag(parseTag(s)); };
    let createSeq = function(s) {
        let tag = parseTag(tagPart(s));
        let index = parseIndex(indexPart(s));
        return index === undefined ? fromAnyItem(tag) : fromItem(tag, index);
    };
    let addSeq = function(s, path) {
        let tag = parseTag(tagPart(s));
        let index = parseIndex(indexPart(s));
        return index === undefined ? path.thenAnyItem(tag) : path.thenItem(tag, index);
    };

    let tags = s.indexOf(".") > 0 ? s.split(".") : [s];
    let seqTags = tags.length > 1 ? tags.slice(0, tags.length - 1) : []; // list of sequence tags, if any
    let lastTag = tags[tags.length - 1]; // tag or sequence
    try {
        let first = seqTags.length > 0 ? seqTags[0] : undefined;
        if (first) {
            let tree = seqTags.slice(1, seqTags.length).reduce((tree, tag) => addSeq(tag, tree), createSeq(first));
            if (tree !== undefined) return isSeq(lastTag) ? addSeq(lastTag, tree) : addTag(lastTag, tree);
            return isSeq(lastTag) ? createSeq(lastTag) : createTag(lastTag);
        }
        return createTag(lastTag);
    } catch (error) {
        throw new Error("Tag tree could not be parsed: " + error.message);
    }
};

module.exports = {
    emptyTagTree: emptyTagTree,
    TagTreeTrunk: TagTreeTrunk,
    TagTreeTag: TagTreeTag,
    TagTreeItem: TagTreeItem,
    TagTreeAnyItem: TagTreeAnyItem,
    fromTag: fromTag,
    fromItem: fromItem,
    fromAnyItem: fromAnyItem,
    fromPath: fromPath,
    parse: parse
};
