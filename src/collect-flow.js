const base = require("./base");
const {HeaderPart, ValueChunk, ElementsPart} = require("./parts");
const {Elements, ValueElement} = require("./elements");
const {Value} = require("./value");
const Tag = require("./tag");
const VR = require("./vr");
const {CharacterSets} = require("./character-sets");
const {valueChunkMarker, sequenceDelimitationPartMarker, ItemDelimitationPartMarker, GuaranteedValueEvent,
    GuaranteedDelimitationEvents, InFragments, DeferToPartFlow, EndEvent, TagPathTracking, create} = require("./dicom-flow");

function collectFlow(tagCondition, stopCondition, label, maxBufferSize) {
    maxBufferSize = maxBufferSize === undefined ? 1000000 : maxBufferSize;

    return create(new class extends EndEvent(TagPathTracking(GuaranteedDelimitationEvents(GuaranteedValueEvent(InFragments(DeferToPartFlow))))) {
        constructor() {
            super();
            this.reachedEnd = false;
            this.currentBufferSize = 0;
            this.currentElement = undefined;
            this.buffer = [];
            this.elements = Elements.empty();
        }

        elementsAndBuffer() {
            let parts = base.prependToArray(new ElementsPart(label, this.elements), this.buffer);

            this.reachedEnd = true;
            this.buffer = [];
            this.currentBufferSize = 0;

            return parts;
        }

        onEnd() {
            return this.reachedEnd ? [] : this.elementsAndBuffer();
        }

        onPart(part) {
            if (this.reachedEnd)
                return [part];
            else {
                if (maxBufferSize > 0 && this.currentBufferSize > maxBufferSize)
                    throw Error("Error collecting elements: max buffer size exceeded");

                if (part !== valueChunkMarker && part !== sequenceDelimitationPartMarker && !(part instanceof ItemDelimitationPartMarker)) {
                    this.buffer.push(part);
                    this.currentBufferSize += part.bytes.length;
                }

                if (part.tag !== undefined && stopCondition(this.tagPath))
                    return this.elementsAndBuffer();

                if (part instanceof HeaderPart && (tagCondition(this.tagPath) || part.tag === Tag.SpecificCharacterSet)) {
                    this.currentElement = new ValueElement(part.tag, part.vr, Value.empty(), part.bigEndian, part.explicitVR);
                    return [];
                }

                if (part instanceof HeaderPart) {
                    this.currentElement = undefined;
                    return [];
                }

                if (part instanceof ValueChunk) {
                    if (this.currentElement !== undefined) {
                        let element = this.currentElement;
                        let updatedElement = new ValueElement(element.tag, element.vr, Value.fromBuffer(element.vr, base.concat(element.value.bytes, part.bytes)), element.bigEndian, element.explicitVR);
                        this.currentElement = updatedElement;
                        if (part.last) {
                            if (updatedElement.tag === Tag.SpecificCharacterSet)
                                this.elements = this.elements.setCharacterSets(CharacterSets.fromNames(updatedElement.value.toSingleString(VR.CS)));
                            if (tagCondition(this.tagPath))
                                this.elements = this.elements.setElementSet(updatedElement);
                            this.currentElement = undefined;
                        }
                    }

                    return [];
                }

                return [];
            }
        }

    });
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
