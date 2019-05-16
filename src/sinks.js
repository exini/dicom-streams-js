const {Writable} = require("readable-stream");
const base = require("./base");

const byteSink = function(callback) {
    let buffer = base.emptyBuffer;

    let sink = new Writable({
        write(chunk, encoding, cb) {
            buffer = base.concat(buffer, chunk);
            process.nextTick(() => cb());
        }
    });

    sink.once("finish", () => {
        callback(buffer);
    });

    return sink;
};

const ignoreSink = function (objectMode) {
    return new Writable({
        objectMode: objectMode === undefined ? false : objectMode,
        write(chunk, encoding, callback) {
            process.nextTick(() => callback());
        }
    })
};

const arraySink = function (arrayCallback) {
    let array = [];
    let sink = new Writable({
        objectMode: true,
        write(chunk, encoding, callback) {
            array.push(chunk);
            process.nextTick(() => callback());
        }
    });
    sink.once("finish", () => arrayCallback(array));
    return sink;
};

module.exports = {
    byteSink: byteSink,
    ignoreSink: ignoreSink,
    arraySink: arraySink
};
