const path = require('path');
const nodeExternals = require('webpack-node-externals');
const webpackMerge = require('webpack-merge');

const commonConfig = {
    entry: {
        main: [path.resolve(__dirname, '../src/index.ts')]
    },
    output: {
        library: 'dicomStreams'
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },  
    module: {
        rules: [
            {
              test: /\.tsx?$/,
              loader: 'awesome-typescript-loader',
            }
        ]
    }
};

const nodeConfig = {
    target: 'node',
    output: {
        path: path.resolve(__dirname, '../dist/node'),
        libraryTarget: 'commonjs2'
    },
    externals: [nodeExternals()]
};

const webConfig = {
    target: 'web',
    output: {
        path: path.resolve(__dirname, '../dist/web'),
        libraryTarget: 'umd'
    },
};

module.exports = [
    webpackMerge(commonConfig, nodeConfig),
    webpackMerge(commonConfig, webConfig),
];
