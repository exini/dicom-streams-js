const base = require("./base");
const {TagPathLike} = require("./tag-path-like");
const dictionary = require("./dictionary");

class TagPath extends TagPathLike {
    constructor(tag, previous) {
        super();
        this._tag = tag;
        this._previous = previous;
    }

    static fromTag(tag) { return emptyTagPath.thenTag(tag); }
    static fromSequence(tag) { return emptyTagPath.thenSequence(tag); }
    static fromSequenceEnd(tag) { return emptyTagPath.thenSequenceEnd(tag); }
    static fromItem(tag, item) { return emptyTagPath.thenItem(tag, item); }
    static fromItemEnd(tag, item) { return emptyTagPath.thenItemEnd(tag, item); }

    static parse(s) {
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
            let i = parseInt(s);
            if (isNaN(i)) throw new Error(s + " is not a number");
            return i;
        };
        let createTag = function(s) { return TagPath.fromTag(parseTag(s)); };
        let addTag = function(s, path) { return path.thenTag(parseTag(s)); };
        let createSeq = function(s) { return TagPath.fromItem(parseTag(tagPart(s)), parseIndex(indexPart(s))); };
        let addSeq = function(s, path) { return path.thenItem(parseTag(tagPart(s)), parseIndex(indexPart(s))); };

        let tags = s.indexOf(".") > 0 ? s.split(".") : [s];
        let seqTags = tags.length > 1 ? tags.slice(0, tags.length - 1) : []; // list of sequence tags, if any
        let lastTag = tags[tags.length - 1]; // tag or sequence
        try {
            let first = seqTags.length > 0 ? seqTags[0] : undefined;
            if (first) {
                let path = seqTags.slice(1, seqTags.length).reduce((path, tag) => addSeq(tag, path), createSeq(first));
                return addTag(lastTag, path);
            }
            return createTag(lastTag);
        } catch (error) {
            throw new Error("Tag path could not be parsed: " + error.message);
        }
    }

    tag() { return this._tag; }

    previous() { return this._previous; };

    isEmpty() { return this === emptyTagPath; }

    isBelow(that) {
        let thisList = this.toList();
        let thatList = that.toList();

        for (let i = 0; i < Math.min(thisList.length, thatList.length); i++) {
            let thisPath = thisList[i];
            let thatPath = thatList[i];
            if (thisPath.isEmpty()) return !thatPath.isEmpty();
            if (thatPath.isEmpty()) return false;
            if (thisPath.tag() !== thatPath.tag()) return thisPath.tag() < thatPath.tag();
            if (thisPath instanceof TagPathSequence && thatPath.item !== undefined) return true;
            if (thisPath instanceof TagPathSequence && thatPath instanceof TagPathSequenceEnd) return true;
            if (thisPath instanceof TagPathSequenceEnd && thatPath.item !== undefined) return false;
            if (thisPath instanceof TagPathSequenceEnd && thatPath instanceof TagPathSequence) return false;
            if (thisPath.item !== undefined && thatPath instanceof TagPathSequence) return false;
            if (thisPath.item !== undefined && thatPath instanceof TagPathSequenceEnd) return true;
            if (thisPath.item !== undefined && thatPath.item !== undefined && thisPath.item !== thatPath.item) return thisPath.item < thatPath.item;
            if (thisPath instanceof TagPathItem && thatPath instanceof TagPathItemEnd) return true;
            if (thisPath instanceof TagPathItemEnd && thatPath instanceof TagPathItem) return false;
        }
        return thisList.length < thatList.length;
    }

    isEqualTo(that) {
        if (this.isEmpty() && that.isEmpty()) return true;
        if (this instanceof TagPathTag && that instanceof TagPathTag) return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        if (this instanceof TagPathSequence && that instanceof TagPathSequence) return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        if (this instanceof TagPathSequenceEnd && that instanceof TagPathSequenceEnd) return this.tag() === that.tag() && this.previous().isEqualTo(that.previous());
        if (this instanceof TagPathItem && that instanceof TagPathItem) return this.tag() === that.tag() && this.item === that.item && this.previous().isEqualTo(that.previous());
        if (this instanceof TagPathItemEnd && that instanceof TagPathItemEnd) return this.tag() === that.tag() && this.item === that.item && this.previous().isEqualTo(that.previous());
        return false;
    }

    startsWith(that) {
        let thisDepth = this.depth();
        let thatDepth = that.depth();
        if (thisDepth >= thatDepth) {
            let n = Math.min(thisDepth, thatDepth);
            return this.take(n).isEqualTo(that.take(n));
        } else
            return false;
    }

    endsWith(that) {
        let n = this.depth() - that.depth();
        return n >= 0 ? this.drop(n).isEqualTo(that) : false;
    }

    drop(n) {
        let dropRec = function(path, i) {
            if (i < 0)
                return emptyTagPath;
            if (i === 0) {
                if (path.isEmpty()) return emptyTagPath;
                if (path instanceof TagPathItem) return TagPath.fromItem(path.tag(), path.item);
                if (path instanceof TagPathItemEnd) return TagPath.fromItemEnd(path.tag(), path.item);
                if (path instanceof TagPathSequence) return TagPath.fromSequence(path.tag());
                if (path instanceof TagPathSequenceEnd) return TagPath.fromSequenceEnd(path.tag());
                return TagPath.fromTag(path.tag());
            }
            let p = dropRec(path.previous(), i - 1);
            if (path instanceof TagPathItem) return p.thenItem(path.tag(), path.item);
            if (path instanceof TagPathItemEnd) return p.thenItemEnd(path.tag(), path.item);
            if (path instanceof TagPathSequence) return p.thenSequence(path.tag());
            if (path instanceof TagPathSequenceEnd) return p.thenSequenceEnd(path.tag());
            if (path instanceof TagPathTag) return p.thenTag(path.tag());
            return emptyTagPath;
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
        let toTagPathString = function(path, tail) {
            let itemIndexSuffix = path.item !== undefined ? "[" + path.item + "]" : "";
            let head = toTagString(path.tag()) + itemIndexSuffix;
            let part = head + tail;
            return path.isRoot() ? part : toTagPathString(path.previous(), "." + part);
        };
        return this.isEmpty() ? "<empty path>" : toTagPathString(this, "");
    }
}

class TagPathTrunk extends TagPath {
    thenTag(tag) { return new TagPathTag(tag, this); }
    thenSequence(tag) { return new TagPathSequence(tag, this); }
    thenSequenceEnd(tag) { return new TagPathSequenceEnd(tag, this); }
    thenItem(tag, item) { return new TagPathItem(tag, item, this); }
    thenItemEnd(tag, item) { return new TagPathItemEnd(tag, item, this); }
}

class EmptyTagPath extends TagPathTrunk {
    tag() { throw new Error("Empty tag path"); }
    previous() { return emptyTagPath; }
}
const emptyTagPath = new EmptyTagPath(-1, null);

class TagPathTag extends TagPath {
    constructor(tag, previous) {
        super(tag, previous);
    }
}

class TagPathSequence extends TagPath {
    constructor(tag, previous) {
        super(tag, previous);
    }
}

class TagPathSequenceEnd extends TagPath {
    constructor(tag, previous) {
        super(tag, previous);
    }
}

class TagPathItem extends TagPathTrunk {
    constructor(tag, item, previous) {
        super(tag, previous);
        this.item = item;
    }
}

class TagPathItemEnd extends TagPathTrunk {
    constructor(tag, item, previous) {
        super(tag, previous);
        this.item = item;
    }
}

module.exports = {
    emptyTagPath: emptyTagPath,
    TagPathTrunk: TagPathTrunk,
    TagPath: TagPath,
    TagPathTag: TagPathTag,
    TagPathItem: TagPathItem,
    TagPathItemEnd: TagPathItemEnd,
    TagPathSequence: TagPathSequence,
    TagPathSequenceEnd: TagPathSequenceEnd
};
