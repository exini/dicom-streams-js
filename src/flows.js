const {Transform} = require("readable-stream");

function identityFlow(objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        transform(chunk, encoding, callback) {
            this.push(chunk);
            callback();
        }
    });
}

function printFlow(objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        transform(chunk, encoding, callback) {
            console.log(chunk);
            this.push(chunk);
            callback();
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
            callback();
        }
    });
}

function appendFlow(appendChunk, objectMode) {
    return new Transform({
        objectMode: objectMode === undefined ? false : objectMode,
        transform(chunk, encoding, callback) {
            this.push(chunk);
            callback();
        },
        flush(callback) {
            this.push(appendChunk);
            callback();
        }
    });
}

function objectToStringFlow(toStringFunction) {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
            this.push(toStringFunction(chunk) + "\n");
            callback();
        }
    });
}

function mapConcatFlow(toChunks) {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            for (let outChunk of toChunks(chunk))
                this.push(outChunk);
            callback();
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
