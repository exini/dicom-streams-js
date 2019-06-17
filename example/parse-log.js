const fs = require("fs");
const pipe = require("multipipe");
const {parseFlow} = require("../src/parse-flow");
const {elementFlow} = require("../src/element-flows");
const {elementSink} = require("../src/element-sink");


const src = fs.createReadStream(process.argv[2]);

pipe(
    src,
    parseFlow(),
    elementFlow(),
    elementSink(elements => {
        console.log(elements.toString());
    })
);

