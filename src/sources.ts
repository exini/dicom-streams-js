import { Readable } from 'stream';

export function singleSource(element: any, objectMode = false): Readable {
    return new Readable({
        objectMode,
        read(): void {
            this.push(element);
            this.push(null);
        },
    });
}

export function arraySource(array: any[], objectMode = false): Readable {
    let pos = 0;
    return new Readable({
        highWaterMark: 1,
        objectMode,
        read(size: number): void {
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
