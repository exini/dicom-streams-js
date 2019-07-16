import assert from "assert";
import {Tag} from "../src/tag";
import {TagPathLike} from "../src/tag-path-like";

// tslint:disable: max-classes-per-file

class TestTagPath extends TagPathLike<TestTagPath> {
    constructor(private readonly tagVal: number, private readonly previousVal: TestTagPath = emptyTagPath) {
        super();
    }
    public tag(): number { return this.tagVal; }
    public previous(): TestTagPath { return this.previousVal; }
    public isEmpty() { return false; }
    public drop(n: number): TestTagPath {
        throw new Error("Method not implemented.");
    }
}

class EmptyTagPath extends TestTagPath {
    constructor() {
        super(-1, null);
    }
    public tag(): number { throw Error("Empty tag path"); }
    public previous(): TestTagPath { return this; }
    public isEmpty(): boolean { return true; }
}
const emptyTagPath = new EmptyTagPath();

describe("The tag path depth", () => {

    it("should be 1 when pointing to a tag in the root dataset", () => {
        const path = new TestTagPath(Tag.PatientID);
        assert.strictEqual(path.depth(), 1);
    });

    it("should be 0 for empty tag paths", () => {
        assert.strictEqual(emptyTagPath.depth(), 0);
    });

    it("should be 4 when pointing to a tag in three levels of sequences", () => {
        const path = new TestTagPath(Tag.PatientID, new TestTagPath(Tag.DerivationCodeSequence,
            new TestTagPath(Tag.DerivationCodeSequence, new TestTagPath(Tag.DerivationCodeSequence))));
        assert.strictEqual(path.depth(), 4);
    });
});

describe("A tag path", () => {

    it("should be root when pointing to root dataset", () => {
        const path = new TestTagPath(Tag.PatientID);
        assert(path.isRoot());
    });

    it("should not be root when pointing to a tag in a sequence", () => {
        const path = new TestTagPath(Tag.PatientID, new TestTagPath(Tag.DerivationCodeSequence));
        assert(!path.isRoot());
    });
});

describe("A list representation of tag path tags", () => {
    it("should contain a single entry for a tag in the root dataset", () => {
        const path = new TestTagPath(Tag.PatientID);
        assert.deepStrictEqual(path.toList(), [path]);
    });

    it("should contain four entries for a path of depth 3", () => {
        const path = new TestTagPath(Tag.PatientID, new TestTagPath(Tag.DerivationCodeSequence,
            new TestTagPath(Tag.DerivationCodeSequence, new TestTagPath(Tag.DerivationCodeSequence))));
        assert.deepStrictEqual(path.toList(), [path.previous().previous().previous(), path.previous().previous(),
            path.previous(), path]);
    });
});

describe("The tag path contains test", () => {
    it("should return for any tag number on the tag path", () => {
        const path = new TestTagPath(3, new TestTagPath(2, new TestTagPath(1)));
        assert(path.contains(1));
        assert(path.contains(2));
        assert(path.contains(3));
        assert(!path.contains(4));
    });
});

describe("The tag path take operation", () => {
    it("should preserve elements from the left", () => {
        const path = new TestTagPath(4, new TestTagPath(3, new TestTagPath(2, new TestTagPath(1))));
        assert.strictEqual(path.take(-100), emptyTagPath);
        assert.strictEqual(path.take(0), emptyTagPath);
        assert.strictEqual(path.take(1), path.previous().previous().previous());
        assert.strictEqual(path.take(2), path.previous().previous());
        assert.strictEqual(path.take(3), path.previous());
        assert.strictEqual(path.take(4), path);
        assert.strictEqual(path.take(100), path);
    });
});

describe("The head of a tag path", () => {
    it("should be the root element of the path", () => {
        assert.deepStrictEqual(new TestTagPath(1).head(), new TestTagPath(1));
        assert.deepStrictEqual(new TestTagPath(2, new TestTagPath(1)).head(), new TestTagPath(1));
        assert.deepStrictEqual(new TestTagPath(3, new TestTagPath(2, new TestTagPath(1))).head(), new TestTagPath(1));
    });
});
