import { Transform } from 'stream';

export function identityFlow(objectMode = false): Transform {
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback): void {
            this.push(chunk);
            process.nextTick(() => callback());
        },
    });
}

export function printFlow(objectMode = false): Transform {
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback): void {
            console.log(chunk);
            this.push(chunk);
            process.nextTick(() => callback());
        },
    });
}

export function prependFlow(prependChunk: any, objectMode = false): Transform {
    let hasEmitted = false;
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback): void {
            if (!hasEmitted) {
                this.push(prependChunk);
                hasEmitted = true;
            }
            this.push(chunk);
            process.nextTick(() => callback());
        },
    });
}

export function appendFlow(appendChunk: any, objectMode = false): Transform {
    return new Transform({
        objectMode,
        transform(chunk, encoding, callback): void {
            this.push(chunk);
            process.nextTick(() => callback());
        },
        flush(callback): void {
            process.nextTick(() => callback(null, appendChunk));
        },
    });
}

export function objectToStringFlow(toStringFunction: (a: any) => string): Transform {
    return new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback): void {
            this.push(toStringFunction(chunk) + '\n');
            process.nextTick(() => callback());
        },
    });
}

export function mapFlow(f: (a: any) => any): Transform {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback): void {
            try {
                this.push(f(chunk));
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit('error', error));
            }
        },
    });
}

export function filterFlow(f: (a: any) => boolean): Transform {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback): void {
            try {
                if (f(chunk) === true) {
                    this.push(chunk);
                }
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit('error', error));
            }
        },
    });
}

export function flatMapFlow(toChunks: (a: any) => any[]): Transform {
    return new Transform({
        objectMode: true,
        transform(chunk, encoding, callback): void {
            try {
                for (const outChunk of toChunks(chunk)) {
                    this.push(outChunk);
                }
                process.nextTick(() => callback());
            } catch (error) {
                process.nextTick(() => this.emit('error', error));
            }
        },
    });
}
