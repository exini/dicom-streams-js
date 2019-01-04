const {Transform} = require("stream");

const printFlow = new Transform({
    transform(chunk, encoding, callback) {
        console.log(chunk);
        this.push(chunk);
        callback();
    }
});

function objectToStringFlow(toStringFunction) {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
            this.push(toStringFunction(chunk) + '\n');
            callback();
        }
    });
}

module.exports = {
    printFlow: printFlow,
    objectToStringFlow: objectToStringFlow
};
