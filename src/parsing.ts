import * as base from "./base";
import { ByteReader } from "./byte-parser";
import * as Lookup from "./lookup";
import * as VR from "./vr";

// tslint:disable: max-classes-per-file

export const dicomPreambleLength = 132;

export function isDICM(bytes: Buffer): boolean {
    return bytes[0] === 68 && bytes[1] === 73 && bytes[2] === 67 && bytes[3] === 77;
}

export class HeaderInfo {
    constructor(
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly hasFmi: boolean) {}
}

export function tryReadHeader(data: Buffer): HeaderInfo {
    const info = headerInfo(data, false);
    return info === undefined ? headerInfo(data, true) : info;
}

export function headerInfo(data: Buffer, assumeBigEndian: boolean): HeaderInfo {
    const tag = base.bytesToTag(data, assumeBigEndian);
    const vr = Lookup.vrOf(tag);
    if (vr === VR.UN || base.groupNumber(tag) !== 2 && base.groupNumber(tag) < 8) {
        return undefined;
    }
    if (base.bytesToVR(data.slice(4, 6)) === vr.code) {
        return { bigEndian: assumeBigEndian, explicitVR: true, hasFmi: base.isFileMetaInformation(tag) };
    }
    if (base.bytesToUInt(data.slice(4, 8), assumeBigEndian) >= 0) {
        if (assumeBigEndian) {
            throw Error("Implicit VR Big Endian encoded DICOM Stream");
        } else {
            return { bigEndian: false, explicitVR: false, hasFmi: base.isFileMetaInformation(tag) };
        }
    }
    return undefined;
}

export function isPreamble(data: Buffer): boolean {
    return data.length >= dicomPreambleLength && isDICM(data.slice(dicomPreambleLength - 4, dicomPreambleLength));
}

export class TagVr {
    // tslint:disable-next-line: no-shadowed-variable
    constructor(public readonly tag: number, public readonly vr: VR.VR) {}
}

export function readTagVr(data: Buffer, bigEndian: boolean, explicitVr: boolean): TagVr {
    const tag = base.bytesToTag(data, bigEndian);
    if (tag === 0xFFFEE000 || tag === 0xFFFEE00D || tag === 0xFFFEE0DD) {
        return new TagVr(tag, undefined);
    }
    if (explicitVr) {
        return new TagVr(tag, VR.valueOf(base.bytesToVR(data.slice(4, 6))));
    }
    return new TagVr(tag, Lookup.vrOf(tag));
}

export class AttributeInfo {
    constructor(
        public readonly tag: number,
        public readonly vr: VR.VR,
        public readonly headerLength: number,
        public readonly valueLength: number) {}
}

export function readHeader(reader: ByteReader, state: any): AttributeInfo {
    reader.ensure(8);
    const tagVrBytes = reader.remainingData().slice(0, 8);
    const tagVr = readTagVr(tagVrBytes, state.bigEndian, state.explicitVR);
    if (tagVr.vr && state.explicitVR) {
        if (tagVr.vr.headerLength === 8) {
            return new AttributeInfo(tagVr.tag, tagVr.vr, 8, base.bytesToUShort(tagVrBytes.slice(6), state.bigEndian));
        }
        reader.ensure(12);
        return new AttributeInfo(tagVr.tag, tagVr.vr, 12,
            base.bytesToUInt(reader.remainingData().slice(8), state.bigEndian));
    }
    return new AttributeInfo(tagVr.tag, tagVr.vr, 8, base.bytesToUInt(tagVrBytes.slice(4), state.bigEndian));
}
