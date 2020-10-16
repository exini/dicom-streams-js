const { merge } = require('webpack-merge');
const configs = require('./webpack.config-base');

const devConfig = {
    output: {
        filename: 'index.js',
    },
    mode: 'development',
    devtool: 'source-map',
};

module.exports = [merge(configs[0], devConfig), merge(configs[1], devConfig)];
