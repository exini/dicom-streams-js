const base = require("./base");
const {HeaderPart, ValueChunk, ElementsPart} = require("./parts");
const {Elements, ValueElement} = require("./elements");
const {Value} = require("./value");
const Tag = require("./tag");
const {CharacterSets} = require("./character-sets");
const {valueChunkMarker, sequenceDelimitationPartMarker, ItemDelimitationPartMarker, DeferToPartFlow, EndEvent,
    TagPathTracking, flow} = require("./dicom-flow");

function collectFlow(tagCondition, stopCondition, label, maxBufferSize) {
    maxBufferSize = maxBufferSize === undefined ? 1000000 : maxBufferSize;

    return flow({}, {
        _reachedEnd: { value: false },
        _currentBufferSize: { value: 0 },
        _currentElement: { value: undefined },
        _buffer:  { value: [] },
        _elements: { value: Elements.empty() },

        elementsAndBuffer: function() {
            let parts = base.prependToArray(new ElementsPart(label, this._elements.value), this._buffer.value);

            this._reachedEnd.value = true;
            this._buffer.value = [];
            this._currentBufferSize.value = 0;

            return parts;
        },

        onEnd: function() {
            return this._reachedEnd.value ? [] : this.elementsAndBuffer();
        },

        onPart: function(part) {
            if (this._reachedEnd.value)
                return [part];
            else {
                if (maxBufferSize > 0 && this._currentBufferSize.value > maxBufferSize)
                    throw Error("Error collecting elements: max buffer size exceeded");

                if (part !== valueChunkMarker && part !== sequenceDelimitationPartMarker && !(part instanceof ItemDelimitationPartMarker)) {
                    this._buffer.value.push(part);
                    this._currentBufferSize.value += part.bytes.length;
                }

                if (part instanceof HeaderPart && stopCondition(this.tagPath()))
                    return this.elementsAndBuffer();

                if (part instanceof HeaderPart && (tagCondition(this.tagPath()) || part.tag === Tag.SpecificCharacterSet)) {
                    this._currentElement.value = new ValueElement(part.tag, part.vr, Value.empty(), part.bigEndian, part.explicitVR);
                    return [];
                }

                if (part instanceof HeaderPart) {
                    this._currentElement.value = undefined;
                    return [];
                }

                if (part instanceof ValueChunk) {
                    if (this._currentElement.value !== undefined) {
                        let element = this._currentElement.value;
                        let updatedElement = new ValueElement(element.tag, element.vr, Value.fromBuffer(element.vr, base.concat(element.value.bytes, part.bytes)), element.bigEndian, element.explicitVR);
                        this._currentElement.value = updatedElement;
                        if (part.last) {
                            if (updatedElement.tag === Tag.SpecificCharacterSet)
                                this._elements.value = this._elements.value.setCharacterSets(CharacterSets.fromBytes(updatedElement.toBytes));
                            if (tagCondition(this.tagPath()))
                                this._elements.value = this._elements.value.setElementSet(updatedElement);
                            this._currentElement.value = undefined;
                        }
                    }

                    return [];
                }

                return [];
            }
        }

    }, DeferToPartFlow, EndEvent, TagPathTracking);
}

function collectFromTagPathsFlow(tagPaths, label, maxBufferSize) {
    let maxTag = tagPaths.length > 0 ? Math.max(...tagPaths.map(t => t.head().tag())) : 0;
    let tagCondition = tagPath => tagPaths.some(tp => tagPath.startsWith(tp));
    let stopCondition = tagPaths.length > 0 ? (tagPath => tagPath.isRoot() && tagPath.tag() > maxTag) : (() => true);

    return collectFlow(tagCondition, stopCondition, label, maxBufferSize)
}

module.exports = {
    collectFlow: collectFlow,
    collectFromTagPathsFlow: collectFromTagPathsFlow
};
