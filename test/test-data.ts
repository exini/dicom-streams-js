import {
    concat,
    concatv,
    emptyBuffer,
    indeterminateLength,
    intToBytes,
    intToBytesLE,
    padToEvenLength,
    shortToBytes,
    tagToBytes,
} from '../src/base';
import { Lookup } from '../src/lookup';
import { HeaderPart } from '../src/parts';
import { Tag } from '../src/tag';
import { UID } from '../src/uid';

export const preamble = concat(Buffer.from(new Array(128).fill(0)), Buffer.from('DICM'));

export function element(tag: number, value: Buffer | string, bigEndian = false, explicitVR = true): Buffer {
    const bytes = value instanceof Buffer ? Buffer.from(value as Buffer) : Buffer.from(value as string);
    const valueBytes = padToEvenLength(bytes, tag);
    const headerBytes = HeaderPart.create(tag, Lookup.vrOf(tag), valueBytes.length, bigEndian, explicitVR).bytes;
    return concat(headerBytes, valueBytes);
}

export function fmiGroupLength(...fmis: Buffer[]): Buffer {
    return element(
        Tag.FileMetaInformationGroupLength,
        intToBytesLE(fmis.map((fmi) => fmi.length).reduce((p, c) => p + c)),
    );
}

export function fmiVersion(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.FileMetaInformationVersion, Buffer.from([0x00, 0x01]), bigEndian, explicitVR);
}

export function transferSyntaxUID(
    uid: string = UID.ExplicitVRLittleEndian,
    bigEndian?: boolean,
    explicitVR?: boolean,
): Buffer {
    uid = uid || UID.ExplicitVRLittleEndian;
    return element(Tag.TransferSyntaxUID, uid, bigEndian, explicitVR);
}

export function mediaStorageSOPClassUID(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.MediaStorageSOPClassUID, UID.CTImageStorage, bigEndian, explicitVR);
}

export function mediaStorageSOPInstanceUID(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(
        Tag.MediaStorageSOPInstanceUID,
        '1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735',
        bigEndian,
        explicitVR,
    );
}

export function sopClassUID(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.SOPClassUID, UID.CTImageStorage, bigEndian, explicitVR);
}

export function groupLength(groupNumber: number, length: number, bigEndian = false, explicitVR = true): Buffer {
    const vrLength = explicitVR ? concat(Buffer.from('UL'), shortToBytes(4, bigEndian)) : intToBytes(4, bigEndian);
    return concatv(shortToBytes(groupNumber, bigEndian), Buffer.from([0, 0]), vrLength, intToBytes(length, bigEndian));
}

export function patientNameJohnDoe(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.PatientName, 'John^Doe', bigEndian, explicitVR);
}
export function emptyPatientName(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.PatientName, '', bigEndian, explicitVR);
}

export function patientID(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.PatientID, '12345678', bigEndian, explicitVR);
}

export function studyDate(bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.StudyDate, '19700101', bigEndian, explicitVR);
}

export function sequence(
    tag: number,
    length: number = indeterminateLength,
    bigEndian = false,
    explicitVR = true,
): Buffer {
    length = length === undefined ? indeterminateLength : length;
    const vrBytes = explicitVR ? concat(Buffer.from('SQ'), Buffer.from([0, 0])) : emptyBuffer;
    return concatv(tagToBytes(tag, bigEndian), vrBytes, intToBytes(length, bigEndian));
}

export function pixelData(length: number, bigEndian?: boolean, explicitVR?: boolean): Buffer {
    return element(Tag.PixelData, Buffer.from(new Array(length).fill(0)), bigEndian, explicitVR);
}
export function pixeDataFragments(bigEndian?: boolean): Buffer {
    return concatv(
        tagToBytes(Tag.PixelData, bigEndian),
        Buffer.from('OW'),
        Buffer.from([0, 0]),
        Buffer.from([0xff, 0xff, 0xff, 0xff]),
    );
}
