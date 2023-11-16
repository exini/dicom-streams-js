import { concat, emptyBuffer } from './base';

export interface ByteParserTarget {
    next(result: any): void;
    fail(error?: any): void;
    complete(): void;
}

const recurse = true;
const dontRecurse = false;
const needMoreData = new Error();

export abstract class ParseStep {
    public abstract parse(reader: ByteReader): ParseResult;

    public onTruncation(reader: ByteReader): void {
        throw Error(reader.remainingSize() + ' bytes remain after finished parsing');
    }
}

class FinishedParser extends ParseStep {
    public parse(): ParseResult {
        throw Error('No initial parser installed: you must use startWith(...)');
    }
}
export const finishedParser = new FinishedParser();

export class ParseResult {
    constructor(public result: any, public nextStep: ParseStep) {}
}

export class ByteReader {
    private input = emptyBuffer;
    private off = 0;

    constructor(input: Buffer) {
        this.setInput(input);
    }

    public setInput(input: Buffer): void {
        this.input = input;
        this.off = 0;
    }

    public hasRemaining(): boolean {
        return this.off < this.input.length;
    }

    public remainingSize(): number {
        return this.input.length - this.off;
    }

    public remainingData(): Buffer {
        return this.hasRemaining() ? this.input.slice(this.off) : emptyBuffer;
    }

    public ensure(n: number): void {
        if (this.remainingSize() < n) {
            throw needMoreData;
        }
    }

    public take(n: number): Buffer {
        if (this.off + n <= this.input.length) {
            const o = this.off;
            this.off = o + n;
            return this.input.slice(o, this.off);
        } else {
            throw needMoreData;
        }
    }
}
export class ByteParser {
    public current: ParseStep = finishedParser;
    public isCompleted = false;
    public hasData = false;

    private reader = new ByteReader(emptyBuffer);
    private buffer: Buffer = emptyBuffer;

    constructor(public readonly out: ByteParserTarget) {}

    public parse(chunk: any): void {
        this.buffer = concat(this.buffer, chunk);
        this.hasData = chunk.length > 0;

        while (this.hasData && !this.isCompleted) {
            this.doParse(1000);
        }
    }

    public flush(): void {
        if (!this.isCompleted) {
            if (this.buffer.length > 0) {
                try {
                    this.reader.setInput(this.buffer);
                    this.current.onTruncation(this.reader);
                    this.complete();
                } catch (error) {
                    this.fail(error);
                }
            } else {
                this.complete();
            }
        }
    }

    public startWith(step: ParseStep): void {
        this.current = step;
    }

    protected complete(): void {
        this.isCompleted = true;
        this.buffer = emptyBuffer;
        this.reader = null;
        this.out.complete();
    }

    protected fail(error?: any): void {
        error.message = 'Parsing failed: ' + (error && error.message ? error.message : '');
        this.isCompleted = true;
        this.buffer = emptyBuffer;
        this.reader = null;
        this.out.fail(error);
    }

    private doParseInner(): boolean {
        if (this.buffer.length > 0) {
            this.reader.setInput(this.buffer);
            try {
                const parseResult = this.current.parse(this.reader);
                if (parseResult.result) {
                    this.out.next(parseResult.result);
                }

                if (parseResult.nextStep === finishedParser) {
                    this.complete();
                    return dontRecurse;
                } else {
                    this.buffer = this.reader.remainingData();
                    this.current = parseResult.nextStep;
                    if (!this.reader.hasRemaining()) {
                        this.hasData = false;
                    }

                    // If this step didn't produce a result, continue parsing.
                    if (!parseResult.result) {
                        return recurse;
                    } else {
                        return dontRecurse;
                    }
                }
            } catch (error) {
                if (error === needMoreData) {
                    this.hasData = false;
                    return dontRecurse;
                }

                this.fail(error);
                return dontRecurse;
            }
        } else {
            this.hasData = false;
            return dontRecurse;
        }
    }

    private doParse(remainingRecursions: number): void {
        if (remainingRecursions === 0) {
            this.fail(
                new Error("Parsing logic didn't produce result. Aborting processing to avoid infinite cycles."),
            );
        } else {
            const doRecurse = this.doParseInner();
            if (doRecurse) {
                this.doParse(remainingRecursions - 1);
            }
        }
    }
}
