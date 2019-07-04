import {Transform} from "readable-stream";

export function identityFlow(objectMode: boolean = false): Transform {
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback) {
            this.push(chunk);
            process.nextTick(() => callback());
        },
    });
}

export function printFlow(objectMode: boolean = false): Transform {
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback) {
            console.log(chunk);
            this.push(chunk);
            process.nextTick(() => callback());
        },
    });
}

export function prependFlow(prependChunk: any, objectMode: boolean = false): Transform {
    let hasEmitted = false;
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback) {
            if (!hasEmitted) {
                this.push(prependChunk);
                hasEmitted = true;
            }
            this.push(chunk);
            process.nextTick(() => callback());
        },
    });
}

export function appendFlow(appendChunk: any, objectMode: boolean = false): Transform {
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback) {
            this.push(chunk);
            process.nextTick(() => callback());
        },
        flush(callback) {
            process.nextTick(() => callback(null, appendChunk));
        },
    });
}

export function objectToStringFlow(toStringFunction: (a: any) => string): Transform {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
            this.push(toStringFunction(chunk) + "\n");
            process.nextTick(() => callback());
        },
    });
}

export function mapFlow(f: (a: any) => any): Transform {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            try {
                this.push(f(chunk));
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit("error", error));
            }
        },
    });
}

export function filterFlow(f: (a: any) => boolean): Transform {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            try {
                if (f(chunk) === true) {
                    this.push(chunk);
                }
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit("error", error));
            }
        },
    });
}

export function flatMapFlow(toChunks: (a: any) => any[]): Transform {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            try {
                for (const outChunk of toChunks(chunk)) {
                    this.push(outChunk);
                }
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit("error", error));
            }
        },
    });
}
