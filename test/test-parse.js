const fs = require("fs");
const {Writable} = require("stream");
const Chunker = require("./chunker");
const {printFlow, objectToStringFlow} = require("../src/flows");

const parser = require("../src/dicom-parser");

const src = fs.createReadStream(process.argv[2]);

const ignore = new Writable({
    write(chunk, encoding, callback) {
        callback();
    }
});

const chunkSize = 5 * 1024 * 1024;

src
    .pipe(new Chunker(chunkSize))
    //.pipe(printFlow)
    .pipe(new parser.ParseFlow(chunkSize, undefined, true))
    .pipe(objectToStringFlow(obj => obj.toString()))
    .pipe(process.stdout);
