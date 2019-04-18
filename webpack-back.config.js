const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    target: "node",
    entry: {
        main: ["./src/index.js"]
    },
    output: {
        path: path.resolve(__dirname, "dist/node"),
        filename: "index.js",
    },
    externals: [nodeExternals()]
};
