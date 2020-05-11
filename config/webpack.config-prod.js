const webpackMerge = require('webpack-merge');
const configs = require('./webpack.config-base');

const prodConfig = {
    output: {
        filename: 'index.min.js',
    },
    mode: 'production',
    devtool: '',
};

module.exports = [webpackMerge(configs[0], prodConfig), webpackMerge(configs[1], prodConfig)];
