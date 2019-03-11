const base = require("./base");
const dictionary = require("./dictionary");
const {HeaderPart, ValueChunk, SequencePart, MetaPart} = require("./parts");
const {emptyTagPath} = require("./tag-path");
const {DeferToPartFlow, EndEvent, TagPathTracking, GroupLengthWarnings, flow} = require("./dicom-flow");

class TagModification {
    constructor(matches, modification) {
        this.matches = matches;
        this.modification = modification;
    }

    static equals(tagPath, modification) {
        return new TagModification(tagPath.equals, modification);
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
    modifications = modifications === undefined ? [] : modifications;
    insertions = insertions === undefined ? [] : insertions;
    logGroupLengthWarnings = logGroupLengthWarnings === undefined ? true : logGroupLengthWarnings;

    let organizeInsertions = function (insertions) {
        let distinct = insertions.filter((a, pos, arr) => {
            return arr.findIndex(b => b.tagPath.isEqualTo(a.tagPath)) === pos;
        }); // distinct by tag path
        return distinct.sort((a, b) => a.tagPath.isBelow(b.tagPath)); // ordered by tag path
    };

    return flow({}, {
        _silent: {value: !logGroupLengthWarnings},

        _currentModifications: {value: modifications},
        _currentInsertions: {value: organizeInsertions(insertions)},

        _currentModification: {value: undefined},
        _currentHeader: {value: undefined},
        _latestTagPath: {value: emptyTagPath},
        _value: {value: base.emptyBuffer},
        _bigEndian: {value: false},
        _explicitVR: {value: true},

        updateSyntax: function (header) {
            this._bigEndian.value = header.bigEndian;
            this._explicitVR.value = header.explicitVR;
        },

        valueOrNot: function (bytes) {
            return bytes.length > 0 ? [new ValueChunk(this._bigEndian.value, bytes, true)] : [];
        },

        headerAndValueParts: function (tagPath, modification) {
            let valueBytes = modification(base.emptyBuffer);
            let vr = dictionary.vrOf(tagPath.tag());
            if (vr === VR.UN) throw Error("Tag is not present in dictionary, cannot determine value representation");
            if (vr === VR.SQ) throw Error("Cannot insert sequences");
            let isFmi = base.isFileMetaInformation(tagPath.tag());
            let header = new HeaderPart(tagPath.tag(), vr, valueBytes.length, isFmi, this._bigEndian.value, this._explicitVR.value);
            return base.prependToArray(header, this.valueOrNot(valueBytes));
        },

        isBetween: function (lowerTag, tagToTest, upperTag) {
            return lowerTag.isBelow(tagToTest) && tagToTest.isBelow(upperTag);
        },

        isInDataset: function (tagToTest, tagPath) {
            return tagToTest.previous().isEqualTo(tagPath.previous());
        },

        findInsertParts: function () {
            return base.flatten(this._currentInsertions.value
                .filter(i => this.isBetween(this._latestTagPath.value, i.tagPath, this.tagPath()))
                .filter(i => this.isInDataset(i.tagPath, this.tagPath()))
                .map(i => this.headerAndValueParts(i.tagPath, () => i.insertion(undefined))));
        },

        findModifyPart: function (header) {
            let mod = this._currentModifications.value.find(m => m.matches(this.tagPath()));
            if (mod !== undefined) {
                this._currentHeader.value = header;
                this._currentModification.value = mod;
                this._value.value = base.emptyBuffer;
                return [];
            } else {
                let ins = this._currentInsertions.value.find(i => i.tagPath.isEqualTo(this.tagPath()));
                if (ins !== undefined) {
                    this._currentHeader.value = header;
                    this._currentModification.value = new TagModification(tp => tp.isEqualTo(ins.tagPath), v => ins.insertion(v));
                    this._value.value = base.emptyBuffer;
                    return [];
                } else
                    return [header];
            }
        },

        onPart: function (part) {
            if (part instanceof TagModificationsPart) {
                if (part.replace) {
                    this._currentModifications.value = part.modifications;
                    this._currentInsertions.value = organizeInsertions(part.insertions);
                } else {
                    this._currentModifications.value = base.concatArrays(this._currentModifications.value, part.modifications);
                    this._currentInsertions.value = organizeInsertions(base.concatArrays(this._currentInsertions.value, part.insertions));
                }
                return [];
            }

            if (part instanceof HeaderPart) {
                this.updateSyntax(part);
                let insertParts = this.findInsertParts();
                let modifyPart = this.findModifyPart(part);
                this._latestTagPath.value = this.tagPath();
                return base.concatArrays(insertParts, modifyPart);
            }

            if (part instanceof SequencePart) {
                let insertParts = this.findInsertParts();
                this._latestTagPath.value = this.tagPath();
                return base.appendToArray(insertParts, part);
            }

            if (part instanceof ValueChunk) {
                if (this._currentModification.value !== undefined && this._currentHeader.value !== undefined) {
                    this._value.value = base.concat(this._value.value, part.bytes);
                    if (part.last) {
                        let newValue = this._currentModification.value.modification(this._value.value);
                        let newHeader = this._currentHeader.value.withUpdatedLength(newValue.length);
                        this._currentModification.value = undefined;
                        this._currentHeader.value = undefined;
                        return base.prependToArray(newHeader, this.valueOrNot(newValue));
                    } else
                        return [];
                } else
                    return [part];
            }

            this._latestTagPath.value = this.tagPath();
            return [part];
        },

        onEnd: function () {
            if (this._latestTagPath.value.isEmpty())
                return [];
            else
                return base.flatten(this._currentInsertions.value
                    .filter(i => i.tagPath.isRoot())
                    .filter(m => this._latestTagPath.value.isBelow(m.tagPath))
                    .map(m => this.headerAndValueParts(m.tagPath, () => m.insertion(undefined))))
        }
    }, DeferToPartFlow, GroupLengthWarnings, TagPathTracking, EndEvent);
}

module.exports = {
    TagModification: TagModification,
    TagInsertion: TagInsertion,
    modifyFlow: modifyFlow
};
