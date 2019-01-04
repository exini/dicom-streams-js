const {Transform} = require("stream");
const base = require("../src/base");

class Chunker extends Transform {
    constructor(size) {
        super();
        this.size = size;
        this.buffer = base.emptyBuffer;
    }

    _transform(chunk, encoding, callback) {
        this.buffer = Buffer.concat([this.buffer, chunk], this.buffer.length + chunk.length);

        while (this.buffer.length >= this.size) {
            let newChunk = this.buffer.slice(0, this.size);
            this.buffer = this.buffer.slice(this.size);
            this.push(newChunk);
        }
        callback();
    }

    _flush(callback) {
        if (this.buffer.length)
            this.push(this.buffer);
        callback();
    }
}

module.exports = Chunker;
