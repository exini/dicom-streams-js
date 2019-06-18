const {Writable} = require("readable-stream");
const {ElementsBuilder} = require("./elements-builder");

function elementSink(callback) {
    let builder = new ElementsBuilder();
    let sink = new Writable({
        objectMode: true,
        write(element, encoding, cb) {
            try {
                builder.addElement(element);
                process.nextTick(() => cb());
            } catch (error) {
                process.nextTick(() => this.emit("error", error));
            }
        }
    });
    sink.once("finish", () => {
        callback(builder.result());
    });
    return sink;
}

module.exports = {
    elementSink: elementSink
};
