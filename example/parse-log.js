const fs = require('fs');
const { parseFlow, elementFlow, elementSink, pipe, VR } = require('../dist');

const src = fs.createReadStream(process.argv[2]);

pipe(
    src,
    parseFlow(),
    elementFlow(),
    elementSink((elements) => {
        console.log(elements.toString());
    }),
);
