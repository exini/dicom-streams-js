import {Writable} from "stream";
import { concat, emptyBuffer } from "./base";

export function byteSink(callback: (b: Buffer) => any) {
    let buffer = emptyBuffer;

    const sink = new Writable({
        write(chunk, encoding, cb) {
            buffer = concat(buffer, chunk);
            process.nextTick(() => cb());
        },
    });

    sink.once("finish", () => {
        callback(buffer);
    });

    return sink;
}

export function ignoreSink(objectMode: boolean = false) {
    return new Writable({
        objectMode,
        write(chunk, encoding, callback) {
            process.nextTick(() => callback());
        },
    });
}

export function arraySink(arrayCallback: (a: any[]) => any) {
    const array: any[] = [];
    const sink = new Writable({
        objectMode: true,
        write(chunk, encoding, callback) {
            array.push(chunk);
            process.nextTick(() => callback());
        },
    });
    sink.once("finish", () => arrayCallback(array));
    return sink;
}
