const path = require('path');
const webpack = require('webpack');


module.exports = {
    target: "web",
    entry: {
        main: ["./src/index.js"],
    },
    output: {
        path: path.resolve(__dirname, "dist/front"),
        filename: "[name].[contenthash:8].js",
    },
    // externals: {
    //   "iconv-lite": "iconv",
    //   "js-joda": "joda",
    //   "uuid": "uuid"
    // }
    plugins: [
        new webpack.HashedModuleIdsPlugin(), // so that file hashes don't change unexpectedly
    ],
    optimization: {
        runtimeChunk: 'single',
        splitChunks: {
            chunks: 'all',
            maxInitialRequests: Infinity,
            minSize: 0,
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name(module) {
                        // get the name. E.g. node_modules/packageName/not/this/part.js
                        // or node_modules/packageName
                        const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];

                        // npm package names are URL-safe, but some servers don't like @ symbols
                        return `npm.${packageName.replace('@', '')}`;
                    },
                },
            },
        }
    },
};
