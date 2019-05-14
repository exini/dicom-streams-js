const assert = require("assert");
const util = require("./test-util");
const {Chunker} = require("./chunker");
const {byteSink} = require("../src/sinks");

describe("A byte sink", function () {

    it("should aggregate bytes", function () {
        let data = Buffer.from([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 5]);

        return util.streamPromise(
            util.singleSource(data),
            new Chunker(4),
            byteSink(buffer => {
                assert.deepStrictEqual(buffer, data);
            }));
    });
});
