const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpackMerge = require('webpack-merge');

const baseConfig = {
    entry: {
        main: ["./src/index.js"],
    },
    output: {
        filename: "index.js",
        library: "DicomStreams",
    },
    mode: 'production',
    devtool: "source-map",
};

const nodeConfig = {
    target: "node",
    output: {
        path: path.resolve(__dirname, "dist/node"),
        libraryTarget: "commonjs2"
    },
    externals: [nodeExternals()]
};

const webConfig = {
    target: "web",
    output: {
        path: path.resolve(__dirname, "dist/web"),
        libraryTarget: "umd"
    },
};

module.exports = [ webpackMerge(baseConfig, nodeConfig), webpackMerge(baseConfig, webConfig) ];
