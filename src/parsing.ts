import {
    bytesToTag,
    bytesToUInt,
    bytesToUShort,
    bytesToVR,
    groupNumber,
    indeterminateLength,
    isFileMetaInformation,
    tagToString,
} from './base';
import { ByteReader } from './byte-parser';
import { Lookup } from './lookup';
import { VR } from './vr';

export const dicomPreambleLength = 132;

export function isDICM(bytes: Buffer): boolean {
    return bytes[0] === 68 && bytes[1] === 73 && bytes[2] === 67 && bytes[3] === 77;
}

export class HeaderInfo {
    constructor(
        public readonly bigEndian: boolean,
        public readonly explicitVR: boolean,
        public readonly hasFmi: boolean,
    ) {}
}

export function tryReadHeader(data: Buffer): HeaderInfo {
    const info = headerInfo(data, false);
    return info === undefined ? headerInfo(data, true) : info;
}

export function headerInfo(data: Buffer, assumeBigEndian: boolean): HeaderInfo {
    const tag = bytesToTag(data, assumeBigEndian);
    const vr = Lookup.vrOf(tag);
    if (vr === VR.UN || (groupNumber(tag) !== 2 && groupNumber(tag) < 8)) {
        return undefined;
    }
    if (bytesToVR(data.slice(4, 6)) === vr.code) {
        return {
            bigEndian: assumeBigEndian,
            explicitVR: true,
            hasFmi: isFileMetaInformation(tag),
        };
    }
    if (bytesToUInt(data.slice(4, 8), assumeBigEndian) >= 0) {
        if (assumeBigEndian) {
            throw Error('Implicit VR Big Endian encoded DICOM Stream');
        } else {
            return {
                bigEndian: false,
                explicitVR: false,
                hasFmi: isFileMetaInformation(tag),
            };
        }
    }
    return undefined;
}

export function isPreamble(data: Buffer): boolean {
    return data.length >= dicomPreambleLength && isDICM(data.slice(dicomPreambleLength - 4, dicomPreambleLength));
}

export class TagVr {
    constructor(public readonly tag: number, public readonly vr: VR) {}
}

export function readTagVr(data: Buffer, bigEndian: boolean, explicitVr: boolean): TagVr {
    const tag = bytesToTag(data, bigEndian);
    if (tag === 0xfffee000 || tag === 0xfffee00d || tag === 0xfffee0dd) {
        return new TagVr(tag, undefined);
    }
    if (explicitVr) {
        return new TagVr(tag, VR.valueOf(bytesToVR(data.slice(4, 6))));
    }
    return new TagVr(tag, Lookup.vrOf(tag));
}

export class AttributeInfo {
    constructor(
        public readonly tag: number,
        public readonly vr: VR,
        public readonly headerLength: number,
        public readonly valueLength: number,
    ) {}
}

export function readHeader(reader: ByteReader, state: any): AttributeInfo {
    reader.ensure(8);
    const tagVrBytes = reader.remainingData().slice(0, 8);
    const tagVr = readTagVr(tagVrBytes, state.bigEndian, state.explicitVR);
    if (tagVr.vr && state.explicitVR) {
        if (tagVr.vr.headerLength === 8) {
            return new AttributeInfo(tagVr.tag, tagVr.vr, 8, bytesToUShort(tagVrBytes.slice(6), state.bigEndian));
        }
        reader.ensure(12);
        return new AttributeInfo(
            tagVr.tag,
            tagVr.vr,
            12,
            bytesToUInt(reader.remainingData().slice(8), state.bigEndian),
        );
    }
    return new AttributeInfo(tagVr.tag, tagVr.vr, 8, bytesToUInt(tagVrBytes.slice(4), state.bigEndian));
}

export function warnIfOdd(tag: number, vr: VR, valueLength: number): void {
    if (valueLength % 2 > 0 && valueLength != indeterminateLength && vr != null && vr != VR.SQ) {
        console.warn(`Element ${tagToString(tag)} has odd length`);
    }
}
