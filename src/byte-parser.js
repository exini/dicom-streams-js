const base = require("./base");

class ByteParser {

    constructor(out) {
        this.out = out;
        this.reader = new ByteReader(base.emptyBuffer);
        this.buffer = base.emptyBuffer;
        this.current = finishedParser;
        this.isCompleted = false;
        this.hasData = false;
    }

    completeStage() {
        this.isCompleted = true;
        this.buffer = base.emptyBuffer;
        this.reader = null;
        this.out.complete();
    }

    failStage(error) {
        error.message = "Parsing failed: " + error.message;
        this.isCompleted = true;
        this.buffer = base.emptyBuffer;
        this.reader = null;
        this.out.fail(error);
    }

    _doParseInner() {
        if (this.buffer.length > 0) {
            this.reader.setInput(this.buffer);
            try {
                let parseResult = this.current.parse(this.reader);
                if (parseResult.result)
                    this.out.next(parseResult.result);

                if (parseResult.nextStep === finishedParser) {
                    this.completeStage();
                    return dontRecurse
                } else {
                    this.buffer = this.reader.remainingData();
                    this.current = parseResult.nextStep;
                    if (!this.reader.hasRemaining())
                        this.hasData = false;

                    // If this step didn't produce a result, continue parsing.
                    if (!parseResult.result)
                        return recurse;
                    else
                        return dontRecurse;
                }
            } catch (error) {
                if (error === needMoreData) {
                    this.hasData = false;
                    return dontRecurse
                }

                this.failStage(error);
                return dontRecurse;

            }
        } else {
            this.hasData = false;
            return dontRecurse;
        }
    }

    _doParse(remainingRecursions) {
        if (remainingRecursions === 0)
            this.failStage(new Error("Parsing logic didn't produce result. Aborting processing to avoid infinite cycles. In the unlikely case that the parsing logic needs more recursion, override ParsingLogic.recursionLimit."));
        else {
            let recurse = this._doParseInner();
            if (recurse) this._doParse(remainingRecursions - 1);
        }
    }

    parse(chunk) {
        this.buffer = base.concat(this.buffer, chunk);
        this.hasData = chunk.length > 0;

        while (this.hasData && !this.isCompleted)
            this._doParse(1000);
    }

    flush() {
        if (!this.isCompleted)
            if (this.buffer.length > 0)
                try {
                    this.reader.setInput(this.buffer);
                    this.current.onTruncation(this.reader);
                    this.completeStage();
                } catch (error) {
                    this.failStage(error);
                }
            else
                this.completeStage();
    }

    startWith(step) {
        this.current = step;
    }
}

const recurse = true;
const dontRecurse = false;
const needMoreData = new Error();

class ParseStep {
    parse(reader) {
    }

    onTruncation(reader) {
        throw Error(reader.remainingSize() + " bytes remain after finished parsing");
    }
}

class FinishedParser extends ParseStep {
    parse(reader) {
        throw Error("No initial parser installed: you must use startWith(...)")
    }
}
const finishedParser = new FinishedParser();

class ParseResult {
    constructor(result, nextStep) {
        this.result = result;
        this.nextStep = nextStep;
    }
}

class ByteReader {
    constructor(input) {
        this.setInput(input);
    }

    setInput(input) {
        this.input = input;
        this.off = 0;
    }

    hasRemaining() {
        return this.off < this.input.length;
    }

    remainingSize() {
        return this.input.length - this.off;
    }

    remainingData() {
        return this.hasRemaining() ? this.input.slice(this.off) : base.emptyBuffer;
    }

    ensure(n) {
        if (this.remainingSize() < n) throw needMoreData;
    }

    take(n) {
        if (this.off + n <= this.input.length) {
            let o = this.off;
            this.off = o + n;
            return this.input.slice(o, this.off);
        } else
            throw needMoreData
    }
}

module.exports = {
    ByteParser: ByteParser,
    ParseStep: ParseStep,
    ParseResult: ParseResult,
    finishedParser: finishedParser
};