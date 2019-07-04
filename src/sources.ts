import {Readable} from "readable-stream";

export function singleSource(element: any, objectMode: boolean = false) {
    return new Readable({
        objectMode,
        read(size: number) {
            this.push(element);
            this.push(null);
        },
    });
}

export function arraySource(array: any[], objectMode: boolean = false) {
    let pos = 0;
    return new Readable({
        highWaterMark: 1,
        objectMode,
        read(size) {
            size = size || 1;
            const maxPos = Math.min(pos + size, array.length);
            let i = pos;
            while (i < maxPos && this.push(array[i++])) {
                // do nothing
            }
            if (i === array.length) {
                this.push(null);
            }
            pos = i;
        },
    });
}
