const path = require('path');
const nodeExternals = require('webpack-node-externals');
const { merge } = require('webpack-merge');

const commonConfig = {
    entry: {
        main: [path.resolve(__dirname, '../src/index.ts')],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        fallback: {
            stream: require.resolve('stream-browserify'),
            zlib: require.resolve('browserify-zlib'),
            buffer: require.resolve('buffer/'),
            assert: require.resolve('assert/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                loader: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
};

const nodeConfig = {
    target: 'node',
    output: {
        path: path.resolve(__dirname, '../dist/node'),
        libraryTarget: 'commonjs2',
    },
    externals: [nodeExternals()],
};

const webConfig = {
    target: 'web',
    output: {
        path: path.resolve(__dirname, '../dist/web'),
        libraryTarget: 'umd',
    },
    externals: ['js-joda'],
};

module.exports = [merge(commonConfig, nodeConfig), merge(commonConfig, webConfig)];
