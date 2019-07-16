import {Transform} from "stream";
import { concat, emptyBuffer } from "../src/base";

export class Chunker extends Transform {

    private buffer: Buffer = emptyBuffer;

    constructor(public readonly size: number) {
        super();
    }

    public _transform(chunk: any, encoding: string, callback: (error?: Error, data?: any) => void) {
        this.buffer = concat(this.buffer, chunk);

        while (this.buffer.length >= this.size) {
            const newChunk = this.buffer.slice(0, this.size);
            this.buffer = this.buffer.slice(this.size);
            this.push(newChunk);
        }
        process.nextTick(() => callback());
    }

    public _flush(callback: (error?: Error, data?: any) => void) {
        if (this.buffer.length) {
            this.push(this.buffer);
        }
        process.nextTick(() => callback());
    }
}
