const webpackMerge = require('webpack-merge');
const configs = require("./webpack.config-base");

const devConfig = {
    output: {
        filename: 'index.js',
    },
    mode: 'development',
    devtool: 'source-map',
};

module.exports = [
    webpackMerge(configs[0], devConfig),
    webpackMerge(configs[1], devConfig)
];
