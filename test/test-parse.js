const fs = require("fs");
const Chunker = require("./chunker");
const {objectToStringFlow} = require("../src/flows");

const parser = require("../src/dicom-parser");

const src = fs.createReadStream(process.argv[2]);

const chunkSize = 5 * 1024 * 1024;

src
    .pipe(new Chunker(chunkSize))
    .pipe(new parser.ParseFlow(chunkSize, undefined, true))
    .pipe(objectToStringFlow(obj => obj.toString()))
    .pipe(process.stdout);
