const assert = require("assert");
const TagTree = require("../src/tag-tree");
const TagPath = require("../src/tag-path");
const Tag = require("../src/tag");

describe("A tag tree", function () {

    it("should have a legible string representation", function () {
        let tree = TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenItem(Tag.DerivationCodeSequence, 3).thenAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.PatientID);
        assert.equal(tree.toNamedString(false), "(0008,9215)[*].(0008,9215)[3].(0008,9215)[*].(0010,0020)");
    });

    it("should support string representations with keywords instead of tag numbers where possible", function () {
        let tree = TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenItem(0x11110100, 3).thenAnyItem(Tag.DetectorInformationSequence).thenTag(Tag.PatientID);
        assert.equal(tree.toNamedString(true), "DerivationCodeSequence[*].(1111,0100)[3].DetectorInformationSequence[*].PatientID");
    });

    it("should be root when pointing to root dataset", function () {
        let tree = TagTree.fromTag(Tag.PatientID);
        assert(tree.isRoot());
    });

    it("should not be root when pointing to a tag in a sequence", function () {
        let tree = TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenTag(Tag.PatientID);
        assert(!tree.isRoot());
    });
});

describe("Two tag trees", function () {

    it("should be equal if they point to the same tree", function () {
        let aTree = TagTree.fromAnyItem(1).thenAnyItem(2).thenAnyItem(3).thenTag(4);
        let bTree = TagTree.fromAnyItem(1).thenAnyItem(2).thenAnyItem(3).thenTag(4);
        assert(aTree.isEqualTo(bTree));
    });

    it("should not be equal if item indices do not match", function () {
        let aTree = TagTree.fromAnyItem(1).thenItem(2, 1).thenAnyItem(3).thenTag(4);
        let bTree = TagTree.fromAnyItem(1).thenItem(2, 2).thenAnyItem(3).thenTag(4);
        assert(!aTree.isEqualTo(bTree));
    });

    it("should not be equal if they point to different tags", function () {
        let aTree = TagTree.fromAnyItem(1).thenAnyItem(2).thenAnyItem(3).thenTag(4);
        let bTree = TagTree.fromAnyItem(1).thenAnyItem(2).thenAnyItem(3).thenTag(5);
        assert(!aTree.isEqualTo(bTree));
    });

    it("should not be equal if they have different depths", function () {
        let aTree = TagTree.fromAnyItem(1).thenAnyItem(3).thenTag(4);
        let bTree = TagTree.fromAnyItem(1).thenAnyItem(2).thenAnyItem(3).thenTag(4);
        assert(!aTree.isEqualTo(bTree));
    });

    it("should not be equal if one points to all indices of a sequence and the other points to a specific index", function () {
        let aTree = TagTree.fromAnyItem(1);
        let bTree = TagTree.fromItem(1, 1);
        assert(!aTree.isEqualTo(bTree));
    });

    it("should be equal if both are empty", function () {
        assert(TagTree.emptyTagTree.isEqualTo(TagTree.emptyTagTree));
    });

    it("should support equals documentation examples", function () {
        assert(TagTree.fromTag(0x00100010).isEqualTo(TagTree.fromTag(0x00100010)));
        assert(!TagTree.fromTag(0x00100010).isEqualTo(TagTree.fromTag(0x00100020)));
        assert(!TagTree.fromTag(0x00100010).isEqualTo(TagTree.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(!TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).isEqualTo(TagTree.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(TagTree.fromItem(0x00089215, 3).thenTag(0x00100010).isEqualTo(TagTree.fromItem(0x00089215, 3).thenTag(0x00100010)));
    });
});

describe("The isPath test", function () {
    it ("should support documentation examples", function () {
        assert(TagTree.fromItem(0x00089215, 3).thenTag(0x00100010).isPath());
        assert(!TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).isPath());
        assert(TagTree.emptyTagTree.isPath());
    });
});

describe("The hasPath test", function () {
    it ("should return true for a path extending from root to leaf", function () {
        assert(TagTree.fromAnyItem(1).thenAnyItem(2).thenItem(3, 3).thenTag(4).hasPath(
            TagPath.fromItem(1, 1).thenItem(2, 2).thenItem(3, 3).thenTag(4)));
    });

    it("should return false for path not beginning at root", function () {
        assert(!TagTree.fromItem(1, 1).thenTag(2).hasPath(TagPath.fromTag(2)));
    });

    it("should return false for path not ending at leaf", function () {
        assert(!TagTree.fromItem(1, 1).thenTag(2).hasPath(TagPath.fromItem(1, 1)));
    });

    it("should work with sequence and item end nodes", function () {
        assert(TagTree.fromAnyItem(1).hasPath(TagPath.fromItemEnd(1, 1)));
        assert(TagTree.fromItem(1, 1).hasPath(TagPath.fromItemEnd(1, 1)));
        assert(TagTree.fromAnyItem(1).hasPath(TagPath.fromSequence(1)));
        assert(TagTree.fromAnyItem(1).hasPath(TagPath.fromSequenceEnd(1)));
    });

    it("should support documentation examples", function () {
        assert(TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasPath(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(!TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasPath(TagPath.fromItem(0x00089215, 1)));
        assert(TagTree.emptyTagTree.hasPath(TagPath.emptyTagPath));
    });
});

describe("The hasTrunk test", function () {
    it ("should return true for equally shaped tree and path", function () {
        let tree = TagTree.fromItem(1, 1).thenItem(2, 2).thenItem(3, 3).thenTag(4);
        let path = TagPath.fromItem(1, 1).thenItem(2, 2).thenItem(3, 3).thenTag(4);
        assert(tree.hasTrunk(path));
    });

    it("should return true for two empty structures", function () {
        assert(TagTree.emptyTagTree.hasTrunk(TagPath.emptyTagPath));
    });

    it("should return true when subject path is empty", function () {
        let aTree = TagTree.fromTag(1);
        assert(aTree.hasTrunk(TagPath.emptyTagPath));
    });

    it("should return false when empty tree starts with non-empty path", function () {
        let path = TagPath.fromTag(1);
        assert(!TagTree.emptyTagTree.hasTrunk(path));
    });

    it("should return false when subject path is longer than tree", function () {
        let tree = TagTree.fromItem(1, 1).thenItem(2, 2).thenTag(4);
        let path = TagPath.fromItem(1, 1).thenItem(2, 2).thenItem(3, 3).thenTag(4);
        assert(!tree.hasTrunk(path));
    });

    it("should return true when a tree with wildcards is compared to a path with item indices", function () {
        let tree = TagTree.fromAnyItem(2).thenAnyItem(3).thenTag(4);
        let path = TagPath.fromItem(2, 4).thenItem(3, 66).thenTag(4);
        assert(tree.hasTrunk(path));
    });

    it("should work with sequence start and end nodes", function () {
        let tree1 = TagTree.fromItem(1, 1).thenTag(2);
        assert(tree1.hasTrunk(TagPath.fromSequence(1)));
        assert(tree1.hasTrunk(TagPath.fromSequenceEnd(1)));

        let tree2 = TagTree.fromAnyItem(1).thenTag(2);
        assert(tree2.hasTrunk(TagPath.fromSequence(1)));
        assert(tree2.hasTrunk(TagPath.fromSequenceEnd(1)));
    });

    it("should work with item start and end nodes", function () {
        assert(TagTree.fromAnyItem(1).thenTag(2).hasTrunk(TagPath.fromItemEnd(1, 1)));
        assert(TagTree.fromItem(1, 1).thenTag(2).hasTrunk(TagPath.fromItemEnd(1, 1)));
    });

    it("should support documentation examples", function () {
        assert(TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasTrunk(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasTrunk(TagPath.fromItem(0x00089215, 1)));
        assert(!TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasTrunk(TagPath.fromTag(0x00100010)));
    });
});

describe("The isTrunkOf test", function () {
    it ("should return true for a tag path extending out of a tag tree", function () {
        assert(TagTree.fromAnyItem(1).thenItem(2, 2).isTrunkOf(TagPath.fromItem(1, 1).thenItem(2, 2).thenTag(3)));
    });

    it("should return true for tree and path of equals length", function () {
        assert(TagTree.fromAnyItem(1).thenItem(2, 2).isTrunkOf(TagPath.fromItem(1, 1).thenItem(2, 2)));
    });

    it("should return false for a trunk of a tree", function () {
        assert(!TagTree.fromAnyItem(1).thenItem(2, 2).isTrunkOf(TagPath.fromItem(1, 1)));
    });

    it("should work with sequence start and end nodes", function () {
        assert(TagTree.fromAnyItem(1).isTrunkOf(TagPath.fromSequence(1)));
        assert(TagTree.fromAnyItem(1).isTrunkOf(TagPath.fromSequenceEnd(1)));
        assert(!TagTree.fromItem(1, 1).isTrunkOf(TagPath.fromSequence(1)));
        assert(!TagTree.fromItem(1, 1).isTrunkOf(TagPath.fromSequenceEnd(1)));
    });

    it("should work with item start and end nodes", function () {
        assert(TagTree.fromAnyItem(1).isTrunkOf(TagPath.fromItem(1, 1)));
        assert(TagTree.fromAnyItem(1).isTrunkOf(TagPath.fromItemEnd(1, 1)));
        assert(TagTree.fromItem(1, 1).isTrunkOf(TagPath.fromItem(1, 1)));
        assert(TagTree.fromItem(1, 1).isTrunkOf(TagPath.fromItemEnd(1, 1)));
    });

    it("should support documentation examples", function () {
        assert(TagTree.fromItem(0x00089215, 1).thenTag(0x00100010).isTrunkOf(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).isTrunkOf(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(TagTree.fromAnyItem(0x00089215).isTrunkOf(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(!TagTree.fromItem(0x00089215, 3).isTrunkOf(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(!TagTree.fromTag(0x00100010).isTrunkOf(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
    });
});

describe("The hasTwig test", function () {
    it ("should return true when a longer tree ends with a shorter path", function () {
        let tree = TagTree.fromItem(1, 3).thenTag(2);
        let path = TagPath.fromTag(2);
        assert(tree.hasTwig(path));
    });

    it("should return true for empty tree and path", function () {
        assert(TagTree.emptyTagTree.hasTwig(TagPath.emptyTagPath));
    });

    it("should return false when checking if non-empty tree ends with empty path", function () {
        let aTree = TagTree.fromTag(1);
        assert(!aTree.hasTwig(TagPath.emptyTagPath));
    });

    it("should return false when empty tree starts with non-empty path", function () {
        let path = TagPath.fromTag(1);
        assert(!TagTree.emptyTagTree.hasTwig(path));
    });

    it("should return false when a shorter tree is compared to a longer path", function () {
        let path = TagPath.fromItem(1, 3).thenTag(2);
        let tree = TagTree.fromTag(2);
        assert(!tree.hasTwig(path));
    });

    it("should return false when tag numbers do not match", function () {
        let tree = TagTree.fromItem(1, 3).thenTag(2);
        let path = TagPath.fromTag(4);
        assert(!tree.hasTwig(path));
    });

    it("should work also with deep structures", function () {
        let tree = TagTree.fromItem(1, 3).thenItem(2, 4).thenItem(3, 5).thenTag(6);
        let path = TagPath.fromItem(2, 4).thenItem(3, 5).thenTag(6);
        assert(tree.hasTwig(path));
    });

    it("should work with sequence and item end nodes", function () {
        assert(TagTree.fromAnyItem(1).hasTwig(TagPath.fromItemEnd(1, 1)));
        assert(TagTree.fromItem(1, 1).hasTwig(TagPath.fromItemEnd(1, 1)));
        assert(TagTree.fromAnyItem(1).hasTwig(TagPath.fromSequence(1)));
        assert(TagTree.fromAnyItem(1).hasTwig(TagPath.fromSequenceEnd(1)));
    });

    it("should support documentation examples", function () {
        assert(TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasTwig(TagPath.fromItem(0x00089215, 1).thenTag(0x00100010)));
        assert(TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasTwig(TagPath.fromTag(0x00100010)));
        assert(!TagTree.fromAnyItem(0x00089215).thenTag(0x00100010).hasTwig(TagPath.fromItem(0x00089215, 1)));
    });
});

describe("Creating a tag path from a tag tree", function () {
    it ("should handle empty tag paths", function () {
        assert.equal(TagTree.fromPath(TagPath.emptyTagPath), TagTree.emptyTagTree);
    });

    it("should handle simple paths", function () {
        assert(TagTree.fromPath(TagPath.fromTag(1)).isEqualTo(TagTree.fromTag(1)));
    });

    it("should handle deep paths", function () {
        assert(TagTree.fromPath(TagPath.fromItem(1, 1).thenItem(2, 2).thenTag(3)).isEqualTo(TagTree.fromItem(1, 1).thenItem(2, 2).thenTag(3)));
    });

    it("should handle sequence and item start and end nodes", function () {
        assert(TagTree.fromPath(TagPath.fromSequence(1)).isEqualTo(TagTree.fromAnyItem(1)));
        assert(TagTree.fromPath(TagPath.fromSequenceEnd(1)).isEqualTo(TagTree.fromAnyItem(1)));
        assert(TagTree.fromPath(TagPath.fromItemEnd(1, 1)).isEqualTo(TagTree.fromItem(1, 1)));
    });
});

describe("Parsing a tag tree", function () {
    it ("should work for well-formed depth 0 tag trees", function () {
        assert(TagTree.parse("(0010,0010)").isEqualTo(TagTree.fromTag(Tag.PatientName)));
    });

    it("should work for deep tag trees", function () {
        assert(TagTree.parse("(0008,9215)[*].(0008,9215)[666].(0010,0010)").isEqualTo(TagTree.fromAnyItem(Tag.DerivationCodeSequence).thenItem(Tag.DerivationCodeSequence, 666).thenTag(Tag.PatientName)));
    });

    it("should throw an exception for malformed strings", function () {
        assert.throws(() => {
            TagTree.parse("abc")
        });
    });

    it("should throw an exception for empty strings", function () {
        assert.throws(() => {
            TagTree.parse("")
        });
    });

    it("should accept both tag numbers and keywords", function () {
        let ref = TagTree.fromItem(Tag.DerivationCodeSequence, 1).thenTag(Tag.PatientName);
        assert(TagTree.parse("(0008,9215)[1].(0010,0010)").isEqualTo(ref));
        assert(TagTree.parse("DerivationCodeSequence[1].(0010,0010)").isEqualTo(ref));
        assert(TagTree.parse("(0008,9215)[1].PatientName").isEqualTo(ref));
        assert(TagTree.parse("DerivationCodeSequence[1].PatientName").isEqualTo(ref));
    });
});

describe("The drop operation", function () {
    it ("should remove elements from the left", function () {
        let path = TagTree.fromItem(1, 1).thenItem(2, 1).thenItem(3, 3).thenTag(4);
        assert(path.drop(-100).isEqualTo(path));
        assert(path.drop(0).isEqualTo(path));
        assert(path.drop(1).isEqualTo(TagTree.fromItem(2, 1).thenItem(3, 3).thenTag(4)));
        assert(path.drop(2).isEqualTo(TagTree.fromItem(3, 3).thenTag(4)));
        assert(path.drop(3).isEqualTo(TagTree.fromTag(4)));
        assert(path.drop(4).isEqualTo(TagTree.emptyTagTree));
        assert(path.drop(100).isEqualTo(TagTree.emptyTagTree));
    });
});
