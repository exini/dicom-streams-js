const {Transform} = require("readable-stream");

class Detour extends Transform {
    constructor(options, detourFlow) {
        super(options);
        if (detourFlow)
            this.setDetourFlow(detourFlow);
        this.detour = false;
    }

    setDetourFlow(detourFlow) {
        this.detourFlow = detourFlow;
    }

    setDetour(detour, initialChunk) {
        this.detour = detour;
        if (this.detourFlow) {
            if (this.detour) {
                this.detourFlow.on("data", chunk => this.process(chunk));
                this.detourFlow.once("end", () => this.cleanup());
                this.detourFlow.once("error", error => this.emit("error", error));
            } else
                this.detourFlow.end();
        }
        if (initialChunk && initialChunk.length)
            if (detour && this.detourFlow)
                this.detourFlow.write(initialChunk);
            else
                this.write(initialChunk)
    }

    process(chunk) {
        throw Error("Must implement process function");
    }

    cleanup() {
    }

    _transform(chunk, encoding, callback) {
        if (this.detour && this.detourFlow)
            if (!this.detourFlow.write(chunk))
                this.detourFlow.once("drain", callback);
            else
                process.nextTick(() => callback());
        else
            this.process(chunk);
            callback();
    }

    _flush(callback) {
        if (this.detour && this.detourFlow) {
            this.detourFlow.once("end", callback);
            this.detourFlow.end();
        } else {
            this.cleanup();
            process.nextTick(() => callback());
        }
    }

}

module.exports = {
    Detour: Detour
};
