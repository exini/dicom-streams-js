const {Readable, Transform} = require("stream");
const {Detour, objectToStringFlow} = require("../dist");

class Inner extends Transform {
    constructor(prefix) {
        super({
            highWaterMark: 10
        });
        this.prefix = prefix || "";
    }

    _transform(chunk, encoding, callback) {
        let out = this.prefix + chunk;
        setTimeout(obj => callback(null, obj), 200, out);
    }
}

class Source extends Readable {
    constructor() {
        super({});
        this.i = 1;
    }

    _read(size) {
        this.push(this.i + "");
        this.i = this.i + 1;
        if (this.i > 30) {
            this.push(null);
        }
    }
}

class WithDetour extends Detour {
    constructor() {
        super({readableObjectMode: true}, new Inner("Detour - "));
    }

    process(chunk) {
        let obj = {result: chunk.toString()};
        if (obj.result === "10")
            this.setDetour(true);
        this.push(obj);
    }

    cleanup() {
        this.push({result: "end"});
    }
}

const source = new Source();
const detour = new WithDetour();

source
    .pipe(detour)
    .pipe(objectToStringFlow(JSON.stringify))
    .pipe(process.stdout);
