let config = {
    entry: ["@babel/polyfill", "./src/index.js"],
    output: {
        path: __dirname + "/dist",
        libraryTarget: 'commonjs',
        filename: "index.js"
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/
            }
        ]
    },
    target: "web"
};

module.exports = config;