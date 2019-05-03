const path = require('path');


module.exports = {
    target: "web",
    entry: {
        main: ["./src/index.js"],
    },
    output: {
        path: path.resolve(__dirname, "dist/web"),
        filename: "index.js",
        library: "DicomStreams",
        libraryTarget: "umd"
    },
};
