import assert from 'assert';
import { pipeline, Transform } from 'stream';
import { promisify } from 'util';
import zlib from 'zlib';
import { VR } from '../src';
import {
    Element,
    FragmentElement,
    FragmentsElement,
    ItemDelimitationElement,
    ItemElement,
    preambleElement,
    SequenceDelimitationElement,
    SequenceElement,
    ValueElement,
} from '../src/dicom-elements';
import {
    DeflatedChunk,
    DicomPart,
    ElementsPart,
    FragmentsPart,
    HeaderPart,
    ItemDelimitationPart,
    ItemPart,
    MetaPart,
    PreamblePart,
    SequenceDelimitationPart,
    SequencePart,
    UnknownPart,
    ValueChunk,
} from '../src/dicom-parts';
import { arraySink } from '../src/sinks';
import { singleSource } from '../src/sources';

export class TestPart extends MetaPart {
    constructor(public readonly id: string) {
        super();
    }

    public toString(): string {
        return 'TestPart: ' + this.id;
    }
}

export class PartProbe {
    private offset = 0;

    constructor(public readonly array: DicomPart[]) {}

    public expectPreamble(): PartProbe {
        assert(this.array[this.offset] instanceof PreamblePart);
        this.offset++;
        return this;
    }

    public expectHeader(tag?: number, vr?: VR, length?: number): PartProbe {
        assert(this.array[this.offset] instanceof HeaderPart);
        const part = this.array[this.offset] as HeaderPart;
        if (length !== undefined) {
            assert.strictEqual(part.length, length);
        }
        if (vr !== undefined) {
            assert.strictEqual(part.vr.name, vr.name);
        }
        if (tag !== undefined) {
            assert.strictEqual(part.tag, tag);
        }
        this.offset++;
        return this;
    }

    public expectValueChunk(data?: Buffer): PartProbe {
        const part = this.array[this.offset];
        assert(part instanceof ValueChunk);
        if (data !== undefined) {
            if (data instanceof Buffer) {
                assert.deepStrictEqual(part.bytes, data);
            } else {
                assert.strictEqual(part.bytes.length, data);
            }
        }
        this.offset++;
        return this;
    }

    public expectDeflatedChunk(): PartProbe {
        assert(this.array[this.offset] instanceof DeflatedChunk);
        this.offset++;
        return this;
    }

    public expectFragments(): PartProbe {
        assert(this.array[this.offset] instanceof FragmentsPart);
        this.offset++;
        return this;
    }

    public expectSequence(tag?: number, length?: number): PartProbe {
        assert(this.array[this.offset] instanceof SequencePart);
        const part = this.array[this.offset] as SequencePart;
        if (length !== undefined) {
            assert.equal(part.length, length);
        }
        if (tag !== undefined) {
            assert.strictEqual(part.tag, tag);
        }
        this.offset++;
        return this;
    }

    public expectItem(length?: number): PartProbe {
        assert(this.array[this.offset] instanceof ItemPart);
        const part = this.array[this.offset] as ItemPart;
        if (length !== undefined) {
            assert.equal(part.length, length);
        }
        this.offset++;
        return this;
    }

    public expectItemDelimitation(): PartProbe {
        assert(this.array[this.offset] instanceof ItemDelimitationPart);
        this.offset++;
        return this;
    }

    public expectSequenceDelimitation(): PartProbe {
        assert(this.array[this.offset] instanceof SequenceDelimitationPart);
        this.offset++;
        return this;
    }

    public expectFragment(length?: number): PartProbe {
        assert(this.array[this.offset] instanceof ItemPart);
        const part = this.array[this.offset] as ItemPart;
        if (length !== undefined) {
            assert.strictEqual(part.length, length);
        }
        this.offset++;
        return this;
    }

    public expectFragmentsDelimitation(): PartProbe {
        return this.expectSequenceDelimitation();
    }

    public expectUnknownPart(): PartProbe {
        assert(this.array[this.offset] instanceof UnknownPart);
        this.offset++;
        return this;
    }

    public expectElements(elementsPart: ElementsPart): PartProbe {
        const part = this.array[this.offset];
        assert(part instanceof ElementsPart);
        assert.deepStrictEqual(part, elementsPart);
        this.offset++;
        return this;
    }

    public expectTestPart(id?: string): PartProbe {
        assert(this.array[this.offset] instanceof TestPart);
        const part = this.array[this.offset] as TestPart;
        if (id !== undefined) {
            assert.equal(part.id, id);
        }
        this.offset++;
        return this;
    }

    public expectDicomComplete(): PartProbe {
        assert(this.offset >= this.array.length);
        this.offset++;
        return this;
    }
}

class ElementProbe {
    private offset = 0;

    constructor(public readonly array: Element[]) {}

    public expectElement(tag?: number, value?: Buffer): ElementProbe {
        const part: Element = this.array[this.offset];
        assert(part instanceof ValueElement || part instanceof SequenceElement || part instanceof FragmentsElement);
        if (part instanceof ValueElement || part instanceof SequenceElement || part instanceof FragmentsElement) {
            if (value !== undefined && part instanceof ValueElement) {
                assert.deepStrictEqual(part.value.bytes, value);
            }
            if (tag !== undefined) {
                assert.strictEqual(part.tag, tag);
            }
            this.offset++;
        }
        return this;
    }

    public expectPreamble(): ElementProbe {
        assert.strictEqual(this.array[this.offset], preambleElement);
        this.offset++;
        return this;
    }

    public expectFragments(tag?: number): ElementProbe {
        const part = this.array[this.offset];
        assert(part instanceof FragmentsElement);
        if (part instanceof FragmentsElement) {
            if (tag !== undefined) {
                assert.strictEqual(part.tag, tag);
            }
            this.offset++;
        }
        return this;
    }

    public expectFragment(length?: number): ElementProbe {
        const part = this.array[this.offset];
        assert(part instanceof FragmentElement);
        if (part instanceof FragmentElement) {
            if (length !== undefined) {
                assert.strictEqual(part.length, length);
            }
            this.offset++;
        }
        return this;
    }

    public expectSequence(tag?: number, length?: number): ElementProbe {
        const part = this.array[this.offset];
        assert(part instanceof SequenceElement);
        if (part instanceof SequenceElement) {
            if (length !== undefined) {
                assert.strictEqual(part.length, length);
            }
            if (tag !== undefined) {
                assert.strictEqual(part.tag, tag);
            }
            this.offset++;
        }
        return this;
    }

    public expectItem(length?: number): ElementProbe {
        const part = this.array[this.offset];
        assert(part instanceof ItemElement);
        if (part instanceof ItemElement) {
            if (length !== undefined) {
                assert.strictEqual(part.length, length);
            }
            this.offset++;
        }
        return this;
    }

    public expectItemDelimitation(): ElementProbe {
        const part = this.array[this.offset];
        assert(part instanceof ItemDelimitationElement);
        if (part instanceof ItemDelimitationElement) {
            this.offset++;
        }
        return this;
    }

    public expectSequenceDelimitation(): ElementProbe {
        const part = this.array[this.offset];
        assert(part instanceof SequenceDelimitationElement);
        this.offset++;
        return this;
    }

    public expectDicomComplete(): ElementProbe {
        assert(this.offset >= this.array.length);
        this.offset++;
        return this;
    }
}

export const streamPromise = promisify(pipeline);
export function partProbe(array: DicomPart[]): PartProbe {
    return new PartProbe(array);
}
export function elementProbe(array: Element[]): ElementProbe {
    return new ElementProbe(array);
}
export function testParts(bytes: Buffer, flow: Transform, assertParts: (parts: any[]) => void): Promise<void> {
    return streamPromise(singleSource(bytes), flow, arraySink(assertParts));
}
export function expectDicomError(asyncFunction: () => Promise<any>): Promise<void> {
    return assert.rejects(asyncFunction);
}
export function deflate(buffer: Buffer, gzip = false): Buffer {
    return gzip ? zlib.deflateSync(buffer) : zlib.deflateRawSync(buffer);
}
