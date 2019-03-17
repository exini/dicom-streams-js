const base = require("./base");
const VR = require("./vr");
const dictionary = require("./dictionary");
const {HeaderPart, ValueChunk, SequencePart, MetaPart} = require("./parts");
const {emptyTagPath} = require("./tag-path");
const {DeferToPartFlow, EndEvent, TagPathTracking, GroupLengthWarnings, GuaranteedValueEvent, GuaranteedDelimitationEvents, InFragments, create} = require("./dicom-flow");

class TagModification {
    constructor(matches, modification) {
        this.matches = matches;
        this.modification = modification;
    }

    static equals(tagPath, modification) {
        return new TagModification(tagPath.isEqualTo.bind(tagPath), modification);
    }

    static endsWith(tagPath, modification) {
        return new TagModification(tp => tp.endsWith(tagPath), modification);
    }

}

class TagInsertion {
    constructor(tagPath, insertion) {
        this.tagPath = tagPath;
        this.insertion = insertion;
    }
}

class TagModificationsPart extends MetaPart {
    constructor(modifications, insertions, replace) {
        super();
        this.modifications = modifications === undefined ? [] : modifications;
        this.insertions = insertions === undefined ? [] : insertions;
        this.replace = replace === undefined ? false : replace;
    }
}

function modifyFlow(modifications, insertions, logGroupLengthWarnings) {
    let mods = modifications === undefined ? [] : modifications;
    let irts = insertions === undefined ? [] : insertions;
    let wrns = logGroupLengthWarnings === undefined ? true : logGroupLengthWarnings;

    let organizeInsertions = function (insertions) {
        let distinct = insertions.filter((a, pos, arr) => {
            return arr.findIndex(b => b.tagPath.isEqualTo(a.tagPath)) === pos;
        }); // distinct by tag path
        return distinct.sort((a, b) => a.tagPath.isBelow(b.tagPath) ? -1 : 1); // ordered by tag path
    };

    return create(new class extends TagPathTracking(GuaranteedValueEvent(GuaranteedDelimitationEvents(GroupLengthWarnings(InFragments(EndEvent(DeferToPartFlow)))))) {
        constructor() {
            super();
            this.silent = !wrns;

            this.currentModifications = mods;
            this.currentInsertions = organizeInsertions(irts.slice());

            this.currentModification = undefined;
            this.currentHeader = undefined;
            this.latestTagPath = emptyTagPath;
            this.value = base.emptyBuffer;
            this.bigEndian = false;
            this.explicitVR = true;
        }

        updateSyntax(header) {
            this.bigEndian = header.bigEndian;
            this.explicitVR = header.explicitVR;
        }

        valueOrNot(bytes) {
            return bytes.length > 0 ? [new ValueChunk(this.bigEndian, bytes, true)] : [];
        }

        headerAndValueParts(tagPath, valueBytes) {
            let vr = dictionary.vrOf(tagPath.tag());
            if (vr === VR.UN) throw Error("Tag is not present in dictionary, cannot determine value representation");
            if (vr === VR.SQ) throw Error("Cannot insert sequences");
            let isFmi = base.isFileMetaInformation(tagPath.tag());
            let header = new HeaderPart(tagPath.tag(), vr, valueBytes.length, isFmi, this.bigEndian, this.explicitVR);
            return base.prependToArray(header, this.valueOrNot(valueBytes));
        }

        isBetween(lowerTag, tagToTest, upperTag) {
            return lowerTag.isBelow(tagToTest) && tagToTest.isBelow(upperTag);
        }

        isInDataset(tagToTest, tagPath) {
            return tagToTest.previous().isEqualTo(tagPath.previous());
        }

        findInsertParts() {
            return base.flatten(this.currentInsertions
                .filter(i => this.isBetween(this.latestTagPath, i.tagPath, this.tagPath))
                .filter(i => this.isInDataset(i.tagPath, this.tagPath))
                .map(i => this.headerAndValueParts(i.tagPath, base.padToEvenLength(i.insertion(undefined), i.tagPath.tag()))));
        }

        findModifyPart(header) {
            let mod = this.currentModifications.find(m => m.matches(this.tagPath));
            if (mod !== undefined) {
                this.currentHeader = header;
                this.currentModification = mod;
                this.value = base.emptyBuffer;
                return [];
            } else {
                let ins = this.currentInsertions.find(i => i.tagPath.isEqualTo(this.tagPath));
                if (ins !== undefined) {
                    this.currentHeader = header;
                    this.currentModification = new TagModification(tp => tp.isEqualTo(ins.tagPath), v => ins.insertion(v));
                    this.value = base.emptyBuffer;
                    return [];
                } else
                    return [header];
            }
        }

        onPart(part) {
            if (part instanceof TagModificationsPart) {
                if (part.replace) {
                    this.currentModifications = part.modifications;
                    this.currentInsertions = organizeInsertions(part.insertions.slice());
                } else {
                    this.currentModifications = base.concatArrays(this.currentModifications, part.modifications);
                    this.currentInsertions = organizeInsertions(base.concatArrays(this.currentInsertions, part.insertions));
                }
                return [];
            }

            if (part instanceof HeaderPart) {
                this.updateSyntax(part);
                let insertParts = this.findInsertParts();
                let modifyPart = this.findModifyPart(part);
                this.latestTagPath = this.tagPath;
                return base.concatArrays(insertParts, modifyPart);
            }

            if (part instanceof SequencePart) {
                let insertParts = this.findInsertParts();
                this.latestTagPath = this.tagPath;
                return base.appendToArray(part, insertParts);
            }

            if (part instanceof ValueChunk) {
                if (this.currentModification !== undefined && this.currentHeader !== undefined) {
                    this.value = base.concat(this.value, part.bytes);
                    if (part.last) {
                        let newValue = base.padToEvenLength(this.currentModification.modification(this.value), this.currentHeader.vr);
                        let newHeader = this.currentHeader.withUpdatedLength(newValue.length);
                        this.currentModification = undefined;
                        this.currentHeader = undefined;
                        return base.prependToArray(newHeader, this.valueOrNot(newValue));
                    } else
                        return [];
                } else
                    return [part];
            }

            this.latestTagPath = this.tagPath;
            return [part];
        }

        onEnd() {
            if (this.latestTagPath.isEmpty())
                return [];
            else
                return base.flatten(this.currentInsertions
                    .filter(i => i.tagPath.isRoot())
                    .filter(m => this.latestTagPath.isBelow(m.tagPath))
                    .map(m => this.headerAndValueParts(m.tagPath, base.padToEvenLength(m.insertion(undefined), m.tagPath.tag()))))
        }
    });
}

module.exports = {
    TagModification: TagModification,
    TagInsertion: TagInsertion,
    TagModificationsPart: TagModificationsPart,
    modifyFlow: modifyFlow
};
