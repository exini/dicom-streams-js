const {Transform} = require("readable-stream");

function identityFlow(objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        transform(chunk, encoding, callback) {
            this.push(chunk);
            process.nextTick(() => callback());
        }
    });
}

function printFlow(objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        transform(chunk, encoding, callback) {
            console.log(chunk);
            this.push(chunk);
            process.nextTick(() => callback());
        }
    });
}

function prependFlow(prependChunk, objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        hasEmitted: false,
        transform(chunk, encoding, callback) {
            if (!this.hasEmitted) {
                this.push(prependChunk);
                this.hasEmitted = true;
            }
            this.push(chunk);
            process.nextTick(() => callback());
        }
    });
}

function appendFlow(appendChunk, objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        transform(chunk, encoding, callback) {
            this.push(chunk);
            process.nextTick(() => callback());
        },
        flush(callback) {
            this.push(appendChunk);
            process.nextTick(() => callback());
        }
    });
}

function objectToStringFlow(toStringFunction) {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
            this.push(toStringFunction(chunk) + "\n");
            process.nextTick(() => callback());
        }
    });
}

function mapConcatFlow(toChunks) {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            try {
                for (let outChunk of toChunks(chunk))
                    this.push(outChunk);
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit("error", error));
            }
        }
    });
}

module.exports = {
    identityFlow: identityFlow,
    printFlow: printFlow,
    prependFlow: prependFlow,
    appendFlow: appendFlow,
    objectToStringFlow: objectToStringFlow,
    mapConcatFlow: mapConcatFlow
};
