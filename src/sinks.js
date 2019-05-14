const {Writable} = require("readable-stream");
const base = require("./base");

let byteSink = function(callback) {
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

module.exports = {
    byteSink: byteSink
};
