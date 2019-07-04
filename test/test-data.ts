import * as base from "../src/base";
import * as Lookup from "../src/lookup";
import {HeaderPart} from "../src/parts";
import Tag from "../src/tag";
import UID from "../src/uid";

export const preamble = base.concat(Buffer.from(new Array(128).fill(0)), Buffer.from("DICM"));

export function element(tag: number, value: Buffer | string, bigEndian: boolean = false, explicitVR: boolean = true) {
    const bytes = value instanceof Buffer ? Buffer.from(value as Buffer) : Buffer.from(value as string);
    const valueBytes = base.padToEvenLength(bytes, tag);
    const headerBytes = HeaderPart.create(tag, Lookup.vrOf(tag), valueBytes.length, bigEndian, explicitVR).bytes;
    return base.concat(headerBytes, valueBytes);
}

export function fmiGroupLength(...fmis: Buffer[]) {
    return element(Tag.FileMetaInformationGroupLength, base.intToBytesLE(fmis.map((fmi) => fmi.length)
        .reduce((p, c) => p + c)));
}

export function fmiVersion(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.FileMetaInformationVersion, Buffer.from([0x00, 0x01]), bigEndian, explicitVR);
}

export function transferSyntaxUID(uid: string = UID.ExplicitVRLittleEndian, bigEndian?: boolean, explicitVR?: boolean) {
    uid = uid || UID.ExplicitVRLittleEndian;
    return element(Tag.TransferSyntaxUID, uid, bigEndian, explicitVR);
}

export function mediaStorageSOPClassUID(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.MediaStorageSOPClassUID, UID.CTImageStorage, bigEndian, explicitVR);
}

export function mediaStorageSOPInstanceUID(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.MediaStorageSOPInstanceUID,
        "1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735", bigEndian, explicitVR);
}

export function sopClassUID(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.SOPClassUID, UID.CTImageStorage, bigEndian, explicitVR);
}

export function groupLength(
    groupNumber: number,
    length: number,
    bigEndian: boolean = false,
    explicitVR: boolean = true) {
    const vrLength = explicitVR ?
        base.concat(Buffer.from("UL"), base.shortToBytes(4, bigEndian)) : base.intToBytes(4, bigEndian);
    return base.concatv(base.shortToBytes(groupNumber, bigEndian), Buffer.from([0, 0]), vrLength,
        base.intToBytes(length, bigEndian));
}

export function patientNameJohnDoe(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.PatientName, "John^Doe", bigEndian, explicitVR);
}
export function emptyPatientName(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.PatientName, "", bigEndian, explicitVR);
}

export function patientID(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.PatientID, "12345678", bigEndian, explicitVR);
}

export function studyDate(bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.StudyDate, "19700101", bigEndian, explicitVR);
}

export function sequence(
    tag: number,
    length: number = base.indeterminateLength,
    bigEndian: boolean = false,
    explicitVR: boolean = true) {
    length = length === undefined ? base.indeterminateLength : length;
    const vrBytes = explicitVR ? base.concat(Buffer.from("SQ"), Buffer.from([0, 0])) : base.emptyBuffer;
    return base.concatv(base.tagToBytes(tag, bigEndian), vrBytes, base.intToBytes(length, bigEndian));
}

export function pixelData(length: number, bigEndian?: boolean, explicitVR?: boolean) {
    return element(Tag.PixelData, Buffer.from(new Array(length).fill(0)), bigEndian, explicitVR);
}
export function pixeDataFragments(bigEndian?: boolean) {
    return base.concatv(base.tagToBytes(Tag.PixelData, bigEndian), Buffer.from("OW"), Buffer.from([0, 0]),
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]));
}
