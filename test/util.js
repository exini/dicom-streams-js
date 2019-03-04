const {Readable, Writable, pipeline} = require("readable-stream");
const {promisify} = require("util");
const zlib = require("zlib");
const assert = require("assert");
const parts = require("../src/parts");
const {ValueElement, ItemElement, ItemDelimitationElement, SequenceElement, SequenceDelimitationElement, FragmentElement, preambleElement, FragmentsElement} = require("../src/elements");

class TestPart extends parts.MetaPart {
    constructor(id) {
        super();
        this.id = id;
    }

    toString() {
        return "TestPart: " + this.id;
    }
}

class PartProbe {
    constructor(array) {
        this.array = array;
        this.offset = 0;
    }

    expectPreamble() {
        assert(this.array[this.offset] instanceof parts.PreamblePart);
        this.offset++;
        return this;
    }

    expectHeader(tag) {
        let part = this.array[this.offset];
        assert(part instanceof parts.HeaderPart);
        if (tag !== undefined)
            assert.equal(part.tag, tag);
        this.offset++;
        return this;
    }

    expectValueChunk(length) {
        let part = this.array[this.offset];
        assert(part instanceof parts.ValueChunk);
        if (length !== undefined)
            assert.equal(part.bytes.length, length);
        this.offset++;
        return this;
    }

    expectDeflatedChunk() {
        assert(this.array[this.offset] instanceof parts.DeflatedChunk);
        this.offset++;
        return this;
    }

    expectFragments() {
        assert(this.array[this.offset] instanceof parts.FragmentsPart);
        this.offset++;
        return this;
    }

    expectSequence(tag) {
        let part = this.array[this.offset];
        assert(part instanceof parts.SequencePart);
        if (tag !== undefined)
            assert.equal(part.tag, tag);
        this.offset++;
        return this;
    }

    expectItem(index) {
        let part = this.array[this.offset];
        assert(part instanceof parts.ItemPart);
        if (index !== undefined)
            assert.equal(part.index, index);
        this.offset++;
        return this;
    }

    expectItemDelimitation() {
        assert(this.array[this.offset] instanceof parts.ItemDelimitationPart);
        this.offset++;
        return this;
    }

    expectSequenceDelimitation() {
        assert(this.array[this.offset] instanceof parts.SequenceDelimitationPart);
        this.offset++;
        return this;
    }

    expectFragment(index, length) {
        let part = this.array[this.offset];
        assert(part instanceof parts.ItemPart);
        if (length !== undefined)
            assert.equal(part.length, length);
        if (index !== undefined)
            assert.equal(part.index, index);
        this.offset++;
        return this;
    }

    expectFragmentsDelimitation() {
        return this.expectSequenceDelimitation();
    }

    expectUnknownPart() {
        assert(this.array[this.offset] instanceof parts.UnknownPart);
        this.offset++;
        return this;
    }

    expectTestPart() {
        assert(this.array[this.offset] instanceof TestPart);
        this.offset++;
        return this;
    }

    expectDicomComplete() {
        assert(this.offset >= this.array.length);
        this.offset++;
        return this;
    }
}

class ElementProbe {
    constructor(array) {
        this.array = array;
        this.offset = 0;
    }

    expectElement(tag, value) {
        let part = this.array[this.offset];
        assert(part instanceof ValueElement || part instanceof SequenceElement || part instanceof FragmentsElement);
        if (value !== undefined)
            assert.deepEqual(part.value.bytes, value);
        if (tag !== undefined)
            assert.equal(part.tag, tag);
        this.offset++;
        return this;
    }

    expectPreamble() {
        assert.equal(this.array[this.offset], preambleElement);
        this.offset++;
        return this;
    }

    expectFragments(tag) {
        let part = this.array[this.offset];
        assert(part instanceof FragmentsElement);
        if (tag !== undefined)
            assert.equal(part.tag, tag);
        this.offset++;
        return this;
    }

    expectFragment(length) {
        let part = this.array[this.offset];
        assert(part instanceof FragmentElement);
        if (length !== undefined)
            assert.equal(part.length, length);
        this.offset++;
        return this;
    }

    expectSequence(tag, length) {
        let part = this.array[this.offset];
        assert(part instanceof SequenceElement);
        if (length !== undefined)
            assert.equal(part.length, length);
        if (tag !== undefined)
            assert.equal(part.tag, tag);
        this.offset++;
        return this;
    }

    expectItem(index, length) {
        let part = this.array[this.offset];
        assert(part instanceof ItemElement);
        if (length !== undefined)
            assert.equal(part.length, length);
        if (index !== undefined)
            assert.equal(part.index, index);
        this.offset++;
        return this;
    }

    expectItemDelimitation(index, marker) {
        let part = this.array[this.offset];
        assert(part instanceof ItemDelimitationElement);
        if (marker !== undefined)
            assert.equal(part.marker, marker);
        if (index !== undefined)
            assert.equal(part.index, index);
        this.offset++;
        return this;
    }

    expectSequenceDelimitation(marker) {
        let part = this.array[this.offset];
        assert(part instanceof SequenceDelimitationElement);
        if (marker !== undefined)
            assert.equal(part.marker, marker);
        this.offset++;
        return this;
    }

    expectDicomComplete() {
        assert(this.offset >= this.array.length);
        this.offset++;
        return this;
    }
}

const self = module.exports = {
    TestPart: TestPart,
    singleSource: function (element, after, objectMode) {
        const readable = new Readable({
            objectMode: objectMode === undefined ? false : objectMode,
            read(size) {
            }
        });
        after = after || 0;
        setTimeout(() => {
            readable.push(element);
            readable.push(null);
        }, after);
        return readable;
    },
    arraySource: function (array, delay, objectMode) {
        let arr = array.slice();
        const readable = new Readable({
            objectMode: objectMode === undefined ? false : objectMode,
            read(size) {
            }
        });
        delay = delay || 0;
        let id = setInterval(() => {
            if (arr.length > 0)
                readable.push(arr.shift());
            else {
                readable.push(null);
                clearInterval(id);
            }
        }, delay);
        return readable;
    },
    ignoreSink: function () {
        return new Writable({
            write(chunk, encoding, callback) {
                callback();
            }
        })
    },
    arraySink: function (arrayCallback) {
        let array = [];
        let sink = new Writable({
            objectMode: true,
            write(chunk, encoding, callback) {
                array.push(chunk);
                callback();
            }
        });
        sink.once("finish", () => arrayCallback(array));
        return sink;
    },
    streamPromise: promisify(pipeline),
    partProbe: function (array) {
        return new PartProbe(array);
    },
    elementProbe: function (array) {
        return new ElementProbe(array);
    },
    testParts: function (bytes, parseFlow, assertParts) {
        return self.streamPromise(
            self.singleSource(bytes),
            parseFlow,
            self.arraySink(assertParts)
        );
    },
    expectDicomError: function (asyncFunction) {
        return assert.rejects(asyncFunction);
    },
    deflate: function(buffer, gzip) {
        return gzip ? zlib.deflateSync(buffer) : zlib.deflateRawSync(buffer);
    }
};
