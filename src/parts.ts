import {
    concat, emptyBuffer, indeterminateLength, intToBytes, isFileMetaInformation, shortToBytes, tagToBytes, tagToString,
    trim,
} from "./base";
import { Elements } from "./elements";
import { VR } from "./vr";

// tslint:disable: max-classes-per-file

export class DicomPart {
    constructor(public readonly bigEndian: boolean, public readonly bytes: Buffer) {}
}

export class MetaPart extends DicomPart {
    constructor() {
        super(false, emptyBuffer);
    }
}

export class PreamblePart extends DicomPart {
    constructor(bytes: Buffer) {
        super(false, bytes);
    }

    public toString(): string {
        return "Preamble []";
    }
}

export class HeaderPart extends DicomPart {
    public static create(tag: number, vr: VR, length: number,
                         bigEndian: boolean = false, explicitVR: boolean = true) {
        const bytes = explicitVR ?
            vr.headerLength === 8 ?
                Buffer.concat([
                    tagToBytes(tag, bigEndian),
                    Buffer.from(vr.name),
                    shortToBytes(length, bigEndian)], 8) :
                Buffer.concat([
                    tagToBytes(tag, bigEndian),
                    Buffer.from(vr.name), Buffer.from([0, 0]),
                    intToBytes(length, bigEndian)], 12) :
            Buffer.concat([
                tagToBytes(tag, bigEndian),
                intToBytes(length, bigEndian)], 8);
        return new HeaderPart(tag, vr, length, isFileMetaInformation(tag), bigEndian, explicitVR, bytes);
    }

    constructor(
        public readonly tag: number,
        public readonly vr: VR,
        public readonly length: number,
        public readonly isFmi: boolean,
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly bytes: Buffer) {
        super(bigEndian, bytes);
        if (!this.bytes) {
            this.bytes = this.explicitVR ?
                vr.headerLength === 8 ?
                    Buffer.concat([
                        tagToBytes(tag, bigEndian),
                        Buffer.from(vr.name),
                        shortToBytes(length, bigEndian)], 8) :
                    Buffer.concat([
                        tagToBytes(tag, bigEndian),
                        Buffer.from(vr.name), Buffer.from([0, 0]),
                        intToBytes(length, bigEndian)], 12) :
                Buffer.concat([
                    tagToBytes(tag, bigEndian),
                    intToBytes(length, bigEndian)], 8);
        }
    }

    public withUpdatedLength(newLength: number): HeaderPart {
        if (newLength === this.length) {
            return this;
        } else {
            let updated = null;
            if ((this.bytes.length >= 8) && this.explicitVR && (this.vr.headerLength === 8)) { // explicit vr
                updated = concat(this.bytes.slice(0, 6), shortToBytes(newLength, this.bigEndian));
            } else if ((this.bytes.length >= 12) && this.explicitVR && (this.vr.headerLength === 12)) { // explicit vr
                updated = concat(this.bytes.slice(0, 8), intToBytes(newLength, this.bigEndian));
            } else { // implicit vr
                updated = concat(this.bytes.slice(0, 4), intToBytes(newLength, this.bigEndian));
            }

            return new HeaderPart(this.tag, this.vr, newLength, this.isFmi, this.bigEndian, this.explicitVR, updated);
        }
    }

    public toString(): string {
        return "Header [tag = " + tagToString(this.tag) + ", vr = " + this.vr.name + ", length = " + this.length +
            ", bigEndian = " + this.bigEndian + ", explicitVR = " + this.explicitVR + "]";
    }
}

export class ValueChunk extends DicomPart {
    constructor(bigEndian: boolean, bytes: Buffer, public readonly last: boolean) {
        super(bigEndian, bytes);
    }

    public toString(): string {
        let ascii = trim(this.bytes.slice(0, 100).toString("ascii").replace(/[^\x20-\x7E]/g, ""));
        if (this.bytes.length > 100) {
            ascii = ascii + "...";
        }
        return "ValueChunk [length = " + this.bytes.length + ", last = " + this.last + ", ascii = " + ascii + "]";
    }
}

export class DeflatedChunk extends DicomPart {
    constructor(bigEndian: boolean, bytes: Buffer) {
        super(bigEndian, bytes);
    }

    public toString(): string {
        return "DeflatedChunk [length = " + this.bytes.length + "]";
    }
}

export class ItemPart extends DicomPart {

    public indeterminate = false;

    constructor(public readonly index: number, public readonly length: number, bigEndian: boolean, bytes: Buffer) {
        super(bigEndian, bytes);
        this.indeterminate = length === indeterminateLength;
    }

    public toString(): string {
        return "Item [length = " + this.length + ", index = " + this.index + "]";
    }
}

export class ItemDelimitationPart extends DicomPart {
    constructor(public readonly index: number, bigEndian: boolean, bytes: Buffer) {
        super(bigEndian, bytes);
    }

    public toString(): string {
        return "ItemDelimitation [index = " + this.index + "]";
    }
}

export class SequencePart extends DicomPart {

    public indeterminate = false;

    constructor(
        public readonly tag: number,
        public readonly length: number,
        bigEndian: boolean,
        public readonly explicitVR: boolean,
        bytes: Buffer) {
        super(bigEndian, bytes);
        this.indeterminate = length === indeterminateLength;
    }

    public toString(): string {
        return "Sequence [tag = " + tagToString(this.tag) + ", length = " + this.length + "]";
    }
}

export class SequenceDelimitationPart extends DicomPart {
    constructor(bigEndian: boolean, bytes: Buffer) {
        super(bigEndian, bytes);
    }

    public toString(): string {
        return "SequenceDelimitation []";
    }
}

export class FragmentsPart extends DicomPart {
    constructor(
        public readonly tag: number,
        public readonly length: number,
        public readonly vr: VR,
        bigEndian: boolean,
        public readonly explicitVR: boolean,
        bytes: Buffer) {
        super(bigEndian, bytes);
    }

    public toString(): string {
        return "Fragments [tag = " + tagToString(this.tag) + ", vr = " + this.vr.name + ", length = " +
            this.length + "]";
    }
}

export class UnknownPart extends DicomPart {
    constructor(bigEndian: boolean, bytes: Buffer) {
        super(bigEndian, bytes);
    }

    public toString(): string {
        return "Unknown []";
    }
}

export class ElementsPart extends MetaPart {
    constructor(public readonly label: string, public readonly elements: Elements) {
        super();
    }
}
