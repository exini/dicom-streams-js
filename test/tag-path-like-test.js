const assert = require("assert");
const {TagPathLike} = require("../src/tag-path-like");
const Tag = require("../src/tag");

class TestTagPath extends TagPathLike {
    constructor(tag, previous) {
        super();
        this._tag = tag;
        this._previous = previous || emptyTagPath;
    }
    tag() { return this._tag; }
    previous() { return this._previous; }
    isEmpty() { return false; }
}

class EmptyTagPath extends TagPathLike {
    tag() { throw Error("Empty tag path"); }
    previous() { return this; }
    isEmpty() { return true; }
}
const emptyTagPath = new EmptyTagPath();


describe("The tag path depth", function () {

    it("should be 1 when pointing to a tag in the root dataset", function () {
        let path = new TestTagPath(Tag.PatientID);
        assert.strictEqual(path.depth(), 1);
    });


    it("should be 0 for empty tag paths", function () {
        assert.strictEqual(emptyTagPath.depth(), 0);
    });

    it("should be 4 when pointing to a tag in three levels of sequences", function () {
        let path = new TestTagPath(Tag.PatientID, new TestTagPath(Tag.DerivationCodeSequence, new TestTagPath(Tag.DerivationCodeSequence, new TestTagPath(Tag.DerivationCodeSequence))));
        assert.strictEqual(path.depth(), 4);
    });
});

describe("A tag path", function () {

    it("should be root when pointing to root dataset", function () {
        let path = new TestTagPath(Tag.PatientID);
        assert(path.isRoot());
    });

    it("should not be root when pointing to a tag in a sequence", function () {
        let path = new TestTagPath(Tag.PatientID, new TestTagPath(Tag.DerivationCodeSequence));
        assert(!path.isRoot())
    });
});

describe("A list representation of tag path tags", function () {
    it("should contain a single entry for a tag in the root dataset", function () {
        let path = new TestTagPath(Tag.PatientID);
        assert.deepStrictEqual(path.toList(), [path]);
    });

    it("should contain four entries for a path of depth 3", function () {
        let path = new TestTagPath(Tag.PatientID, new TestTagPath(Tag.DerivationCodeSequence, new TestTagPath(Tag.DerivationCodeSequence, new TestTagPath(Tag.DerivationCodeSequence))));
        assert.deepStrictEqual(path.toList(), [path.previous().previous().previous(), path.previous().previous(), path.previous(), path]);
    });
});

describe("The tag path contains test", function () {
    it("should return for any tag number on the tag path", function () {
        let path = new TestTagPath(3, new TestTagPath(2, new TestTagPath(1)));
        assert(path.contains(1));
        assert(path.contains(2));
        assert(path.contains(3));
        assert(!path.contains(4));
    });
});

describe("The tag path take operation", function () {
    it("should preserve elements from the left", function () {
        let path = new TestTagPath(4, new TestTagPath(3, new TestTagPath(2, new TestTagPath(1))));
        assert.strictEqual(path.take(-100), emptyTagPath);
        assert.strictEqual(path.take(0), emptyTagPath);
        assert.strictEqual(path.take(1), path.previous().previous().previous());
        assert.strictEqual(path.take(2), path.previous().previous());
        assert.strictEqual(path.take(3), path.previous());
        assert.strictEqual(path.take(4), path);
        assert.strictEqual(path.take(100), path);
    });
});

describe("The head of a tag path", function () {
    it("should be the root element of the path", function () {
        assert.deepStrictEqual(new TestTagPath(1).head(), new TestTagPath(1));
        assert.deepStrictEqual(new TestTagPath(2, new TestTagPath(1)).head(), new TestTagPath(1));
        assert.deepStrictEqual(new TestTagPath(3, new TestTagPath(2, new TestTagPath(1))).head(), new TestTagPath(1));
    });
});

/*
describe("The tail of a tag path", function () {
    it("should be the whole part except the root element", function () {
        assert.strictEqual(new TestTagPath(1).tail(), emptyTagPath);
        assert.strictEqual(new TestTagPath(1).tail(), emptyTagPath);
        assert.deepStrictEqual(new TestTagPath(2, new TestTagPath(1)).tail(), new TestTagPath(2));
        assert.deepStrictEqual(new TestTagPath(3, new TestTagPath(2, new TestTagPath(3))).tail(), new TestTagPath(1, new TestTagPath(2)));
    });
});
*/
