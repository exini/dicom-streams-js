const {Readable} = require("readable-stream");

const singleSource = function (element, objectMode) {
    return new Readable({
        objectMode: objectMode === undefined ? false : objectMode,
        read(size) {
            this.push(element);
            this.push(null);
        }
    });
};

const arraySource = function (array, objectMode) {
    let pos = 0;
    let readable = new Readable({
        highWaterMark: 1,
        objectMode: objectMode === undefined ? false : objectMode,
        read(size) {
            size = size || 1;
            const maxPos = Math.min(pos + size, array.length);
            let i = pos;
            while (i < maxPos && this.push(array[i++]));
            if (i === array.length) {
                this.push(null);
            }
            pos = i;
        }
    });
    return readable;
};

module.exports = {
    singleSource: singleSource,
    arraySource: arraySource
};
