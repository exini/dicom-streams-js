const {Readable, Writable} = require("readable-stream");
const assert = require('assert');
const parts = require("../src/parts");

module.exports = {

    streamSingle: function (element, after, objectMode) {
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
    ignoreSink: new Writable({
        write(chunk, encoding, callback) {
            callback();
        }
    }),
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
    expectPreamble: function(array) {
        assert(array.shift() instanceof parts.PreamblePart);
    },
    expectHeader: function(array, tag) {
        let part = array.shift();
        assert(part instanceof parts.HeaderPart && part.tag === tag);
    },
    expectValueChunk: function(array) {
        assert(array.shift() instanceof parts.ValueChunk);
    },
    expectDicomComplete: function(array) {
        assert(array.length === 0);
    }

};
