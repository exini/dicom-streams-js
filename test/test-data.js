const base = require("../src/base");
const Tag = require("../src/tag");
const UID = require("../src/uid");
const Lookup = require("../src/lookup");
const {HeaderPart} = require("../src/parts");

const self = module.exports = {
    preamble: base.concat(Buffer.from(new Array(128).fill(0)), Buffer.from("DICM")),

    element: function(tag, value, bigEndian, explicitVR) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        explicitVR = explicitVR === undefined ? true : explicitVR;
        let valueBytes = base.padToEvenLength(Buffer.from(value), tag);
        let headerBytes = new HeaderPart(tag, Lookup.vrOf(tag), valueBytes.length, base.isFileMetaInformation(tag), bigEndian, explicitVR).bytes;
        return base.concat(headerBytes, valueBytes);
    },

    fmiGroupLength: function(...fmis) {
        return self.element(Tag.FileMetaInformationGroupLength, base.intToBytesLE(fmis.map(fmi => fmi.length).reduce((p, c) => p + c)));
    },

    fmiVersion: function(bigEndian, explicitVR) {
        return self.element(Tag.FileMetaInformationVersion, Buffer.from([0x00, 0x01]), bigEndian, explicitVR);
    },

    transferSyntaxUID: function(uid, bigEndian, explicitVR) {
        uid = uid || UID.ExplicitVRLittleEndian;
        return self.element(Tag.TransferSyntaxUID, uid, bigEndian, explicitVR);
    },

    mediaStorageSOPClassUID: function(bigEndian, explicitVR) {
        return self.element(Tag.MediaStorageSOPClassUID, UID.CTImageStorage, bigEndian, explicitVR);
    },

    mediaStorageSOPInstanceUID(bigEndian, explicitVR) {
        return self.element(Tag.MediaStorageSOPInstanceUID, "1.2.276.0.7230010.3.1.4.1536491920.17152.1480884676.735", bigEndian, explicitVR);
    },

    sopClassUID(bigEndian, explicitVR) {
        return self.element(Tag.SOPClassUID, UID.CTImageStorage, bigEndian, explicitVR);
    },

    groupLength: function(groupNumber, length, bigEndian, explicitVR) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        explicitVR = explicitVR === undefined ? true : explicitVR;
        let vrLength = explicitVR ? base.concat(Buffer.from("UL"), base.shortToBytes(4, bigEndian)) : base.intToBytes(4, bigEndian);
        return base.concatv(base.shortToBytes(groupNumber, bigEndian), Buffer.from([0, 0]), vrLength, base.intToBytes(length, bigEndian));
    },

    patientNameJohnDoe: function(bigEndian, explicitVR) { return self.element(Tag.PatientName, "John^Doe", bigEndian, explicitVR); },
    emptyPatientName: function(bigEndian, explicitVR) { return self.element(Tag.PatientName, "", bigEndian, explicitVR); },

    patientID: function(bigEndian, explicitVR) { return self.element(Tag.PatientID, "12345678", bigEndian, explicitVR); },

    studyDate: function(bigEndian, explicitVR) { return self.element(Tag.StudyDate, "19700101", bigEndian, explicitVR); },

    sequence: function(tag, length, bigEndian, explicitVR) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        explicitVR = explicitVR === undefined ? true : explicitVR;
        length = length === undefined ? base.indeterminateLength : length;
        let vrBytes = explicitVR ? base.concat(Buffer.from("SQ"), Buffer.from([0, 0])) : base.emptyBuffer;
        return base.concatv(base.tagToBytes(tag, bigEndian), vrBytes, base.intToBytes(length, bigEndian));
    },

    pixelData: function(length, bigEndian, explicitVR) { return self.element(Tag.PixelData, Buffer.from(new Array(length).fill(0)), bigEndian, explicitVR); },
    pixeDataFragments: function(bigEndian) { return base.concatv(base.tagToBytes(Tag.PixelData, bigEndian), Buffer.from("OW"), Buffer.from([0, 0]), Buffer.from([0xFF, 0xFF, 0xFF, 0xFF])) }
};
