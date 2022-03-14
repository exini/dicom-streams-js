const { merge } = require('webpack-merge');
const configs = require('./webpack.config-base');

const prodConfig = {
    output: {
        filename: 'index.min.js',
    },
    mode: 'production',
    devtool: false,
};

module.exports = [merge(configs[0], prodConfig), merge(configs[1], prodConfig)];
