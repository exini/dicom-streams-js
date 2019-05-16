const {Readable} = require("readable-stream");

const singleSource = function (element, after, objectMode) {
    let readable = new Readable({
        objectMode: objectMode === undefined ? false : objectMode,
        read(size) {
        }
    });
    after = after === undefined ? 0 : after;
    setTimeout(() => {
        readable.push(element);
        readable.push(null);
    }, after);
    return readable;
};

const arraySource = function (array, delay, objectMode) {
    let arr = array.slice();
    let readable = new Readable({
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
};

module.exports = {
    singleSource: singleSource,
    arraySource: arraySource
};
