import { ZoneId } from 'js-joda';
import mpipe from 'multipipe';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import * as CS from './character-sets';
import { Lookup } from './lookup';
import { Tag } from './tag';
import { UID } from './uid';
import { VR } from './vr';

// eslint:disable: no-bitwise

export const indeterminateLength = 0xffffffff;
export const zero4Bytes = Buffer.from([0, 0, 0, 0]);

export function concat(a: Buffer, b: Buffer): Buffer {
    return Buffer.concat([a, b], a.length + b.length);
}
export function concatv(...buffers: Buffer[]): Buffer {
    return Buffer.concat(buffers);
}
export function flatten<T>(array: T[][]): T[] {
    return [].concat(...array);
}
export function appendToArray<T>(object: T, array: T[]): T[] {
    const newArray = array.slice();
    newArray.push(object);
    return newArray;
}
export function prependToArray<T>(object: T, array: T[]): T[] {
    const newArray = array.slice();
    newArray.unshift(object);
    return newArray;
}
export function concatArrays<T>(array1: T[], array2: T[]): T[] {
    const newArray = array1.slice();
    array2.forEach((i) => newArray.push(i));
    return newArray;
}

const uidRoot = '2.25';
const uuidNamespace = 'd181d67b-0a1c-45bf-8616-070f1bb0d0cf';

export function hexToDec(s: string): string {
    const digits = [0];
    let carry: number;
    for (let i = 0; i < s.length; i++) {
        carry = parseInt(s.charAt(i), 16);
        for (let j = 0; j < digits.length; j++) {
            digits[j] = digits[j] * 16 + carry;
            carry = (digits[j] / 10) | 0;
            digits[j] %= 10;
        }
        while (carry > 0) {
            digits.push(carry % 10);
            carry = (carry / 10) | 0;
        }
    }
    return digits.reverse().join('');
}

export function toUID(root: string, uuid: string): string {
    const hexStr = uuid.replace(/-/g, '');
    const docStr = hexToDec(hexStr).replace(/^0+/, '');
    return (root + '.' + docStr).substring(0, 64);
}

export function nameBasedUID(name: string, root: string): string {
    return toUID(root, uuidv5(name, uuidNamespace));
}
export function randomUID(root: string): string {
    return toUID(root, uuidv4());
}

export const multiValueDelimiter = '\\';

export const emptyBuffer = Buffer.alloc(0);

export function toUInt32(num: number): number {
    return num >>> 0;
}
export function toInt32(num: number): number {
    return num >> 0;
}
export function shiftLeftUnsigned(num: number, n: number): number {
    return toUInt32(num << n);
}

export function groupNumber(tag: number): number {
    return tag >>> 16;
}
export function elementNumber(tag: number): number {
    return tag & 0xffff;
}
export function bytesToShortBE(bytes: Buffer): number {
    return bytes.readInt16BE(0);
}
export function bytesToShortLE(bytes: Buffer): number {
    return bytes.readInt16LE(0);
}
export function bytesToShort(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToShortBE(bytes) : bytesToShortLE(bytes);
}
export function bytesToUShortBE(bytes: Buffer): number {
    return bytes.readUInt16BE(0);
}
export function bytesToUShortLE(bytes: Buffer): number {
    return bytes.readUInt16LE(0);
}
export function bytesToUShort(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToUShortBE(bytes) : bytesToUShortLE(bytes);
}
export function bytesToVR(bytes: Buffer): number {
    return bytesToUShortBE(bytes);
}
export function bytesToIntBE(bytes: Buffer): number {
    return bytes.readInt32BE(0);
}
export function bytesToIntLE(bytes: Buffer): number {
    return bytes.readInt32LE(0);
}
export function bytesToInt(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToIntBE(bytes) : bytesToIntLE(bytes);
}
export function bytesToUIntBE(bytes: Buffer): number {
    return bytes.readUInt32BE(0);
}
export function bytesToUIntLE(bytes: Buffer): number {
    return bytes.readUInt32LE(0);
}
export function bytesToUInt(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToUIntBE(bytes) : bytesToUIntLE(bytes);
}
export function bytesToTagBE(bytes: Buffer): number {
    return bytesToUIntBE(bytes);
}
export function bytesToTagLE(bytes: Buffer): number {
    return shiftLeftUnsigned(bytes.readUInt16LE(0), 16) + bytes.readUInt16LE(2);
}
export function bytesToTag(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToTagBE(bytes) : bytesToTagLE(bytes);
}
export function bytesToFloatBE(bytes: Buffer): number {
    return bytes.readFloatBE(0);
}
export function bytesToFloatLE(bytes: Buffer): number {
    return bytes.readFloatLE(0);
}
export function bytesToFloat(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToFloatBE(bytes) : bytesToFloatLE(bytes);
}
export function bytesToDoubleBE(bytes: Buffer): number {
    return bytes.readDoubleBE(0);
}
export function bytesToDoubleLE(bytes: Buffer): number {
    return bytes.readDoubleLE(0);
}
export function bytesToDouble(bytes: Buffer, bigEndian = false): number {
    return bigEndian ? bytesToDoubleBE(bytes) : bytesToDoubleLE(bytes);
}

export function intToBytesBE(i: number): Buffer {
    return Buffer.from([i >> 24, i >> 16, i >> 8, i]);
}
export function intToBytesLE(i: number): Buffer {
    return Buffer.from([i, i >> 8, i >> 16, i >> 24]);
}
export function shortToBytesBE(i: number): Buffer {
    return Buffer.from([i >> 8, i]);
}
export function shortToBytesLE(i: number): Buffer {
    return Buffer.from([i, i >> 8]);
}
export function shortToBytes(i: number, bigEndian = false): Buffer {
    return bigEndian ? shortToBytesBE(i) : shortToBytesLE(i);
}
export function intToBytes(i: number, bigEndian = false): Buffer {
    return bigEndian ? intToBytesBE(i) : intToBytesLE(i);
}
export function tagToBytesBE(tag: number): Buffer {
    return intToBytesBE(tag);
}
export function tagToBytesLE(tag: number): Buffer {
    return Buffer.from([tag >> 16, tag >> 24, tag, tag >> 8]);
}
export function tagToBytes(tag: number, bigEndian = false): Buffer {
    return bigEndian ? tagToBytesBE(tag) : tagToBytesLE(tag);
}

export function floatToBytes(f: number, bigEndian = false): Buffer {
    const buf = Buffer.allocUnsafe(4);
    if (bigEndian) {
        buf.writeFloatBE(f, 0);
    } else {
        buf.writeFloatLE(f, 0);
    }
    return buf;
}
export function doubleToBytes(f: number, bigEndian = false): Buffer {
    const buf = Buffer.allocUnsafe(8);
    if (bigEndian) {
        buf.writeDoubleBE(f, 0);
    } else {
        buf.writeDoubleLE(f, 0);
    }
    return buf;
}

export function tagToString(tag: number): string {
    const hex = ('00000000' + tag.toString(16)).slice(-8);
    return '(' + hex.slice(0, 4) + ',' + hex.slice(4, 8) + ')';
}

export function trim(s: string): string {
    return s.replace(/^[\x00-\x20]*/g, '').replace(/[\x00-\x20]*$/g, '');
}

export function padToEvenLength(bytes: Buffer, tagOrVR: number | VR): Buffer {
    const vr = isNaN(tagOrVR as number) ? (tagOrVR as VR) : Lookup.vrOf(tagOrVR as number);
    return (bytes.length & 1) !== 0 ? concat(bytes, Buffer.from([vr.paddingByte])) : bytes;
}

export const itemLE = concat(tagToBytesLE(Tag.Item), intToBytesLE(indeterminateLength));
export const itemBE = concat(tagToBytesBE(Tag.Item), intToBytesBE(indeterminateLength));
export function item(length: number = indeterminateLength, bigEndian = false): Buffer {
    return length === indeterminateLength
        ? bigEndian
            ? itemBE
            : itemLE
        : concat(tagToBytes(Tag.Item, bigEndian), intToBytes(length, bigEndian));
}

export const itemDelimitationLE = concat(tagToBytesLE(Tag.ItemDelimitationItem), zero4Bytes);
export const itemDelimitationBE = concat(tagToBytesBE(Tag.ItemDelimitationItem), zero4Bytes);
export function itemDelimitation(bigEndian = false): Buffer {
    return bigEndian ? itemDelimitationBE : itemDelimitationLE;
}

export const sequenceDelimitationLE = concat(tagToBytesLE(Tag.SequenceDelimitationItem), zero4Bytes);
export const sequenceDelimitationBE = concat(tagToBytesBE(Tag.SequenceDelimitationItem), zero4Bytes);
export function sequenceDelimitation(bigEndian = false): Buffer {
    return bigEndian ? sequenceDelimitationBE : sequenceDelimitationLE;
}
export function sequenceDelimitationNonZeroLength(bigEndian = false): Buffer {
    return concatv(tagToBytes(Tag.SequenceDelimitationItem, bigEndian), intToBytes(0x00000010, bigEndian));
}

export function isFileMetaInformation(tag: number): boolean {
    return (tag & 0xffff0000) === 0x00020000;
}
export function isGroupLength(tag: number): boolean {
    return elementNumber(tag) === 0;
}
export function isDeflated(transferSyntaxUid: string): boolean {
    return transferSyntaxUid === UID.DeflatedExplicitVRLittleEndian || transferSyntaxUid === UID.JPIPReferencedDeflate;
}

export const systemZone = ZoneId.SYSTEM;
export const defaultCharacterSet = CS.defaultCharacterSet;

export function createUID(): string {
    return randomUID(uidRoot);
}
export function createUIDFromRoot(root: string): string {
    return randomUID(root);
}
export function createNameBasedUID(name: string): string {
    return nameBasedUID(name, uidRoot);
}
export function createNameBasedUIDFromRoot(name: string, root: string): string {
    return nameBasedUID(name, root);
}

export function pipe(...streams: any[]): any {
    return mpipe(streams);
}
