const base = require("../src/base");
const Tag = require("../src/tag");
const UID = require("../src/uid");
const dictionary = require("../src/dictionary");
const parts = require("../src/parts");
const parsing = require("../src/parsing");

const self = module.exports = {
    preamble: base.concat(Buffer.from(new Array(128).fill(0)), Buffer.from("DICM")),

    element: function(tag, value, bigEndian, explicitVR) {
        bigEndian = bigEndian === undefined ? false : bigEndian;
        explicitVR = explicitVR === undefined ? true : explicitVR;
        let valueBytes = base.padToEvenLength(Buffer.from(value), tag);
        let headerBytes = new parts.HeaderPart(tag, dictionary.vrOf(tag), valueBytes.length, parsing.isFileMetaInformation(tag), bigEndian, explicitVR).bytes;
        return base.concat(headerBytes, valueBytes);
    },

    fmiGroupLength: function(...fmis) {
        return self.element(Tag.FileMetaInformationGroupLength, base.intToBytesLE(fmis.map(fmi => fmi.length).reduce((p, c) => p + c)), false, true);
    },

    transferSyntaxUID: function(uid, bigEndian, explicitVR) {
        uid = uid || UID.ExplicitVRLittleEndian;
        return self.element(Tag.TransferSyntaxUID, uid, bigEndian, explicitVR);
    },

    patientNameJohnDoe: function(bigEndian, explicitVR) { return self.element(Tag.PatientName, "John^Doe", bigEndian, explicitVR); },
    emptyPatientName: function(bigEndian, explicitVR) { return self.element(Tag.PatientName, "", bigEndian, explicitVR); },

    patientID: function(bigEndian, explicitVR) { return self.element(Tag.PatientID, "12345678", bigEndian, explicitVR); },

    studyDate: function(bigEndian, explicitVR) { return self.element(Tag.StudyDate, "19700101", bigEndian, explicitVR); },

    sequence: function(tag, length, bigEndian) { return base.concatv(base.tagToBytes(tag, bigEndian), Buffer.from("SQ"), Buffer.from([0, 0]), base.intToBytes(length, bigEndian)); },

    itemLE: base.concat(base.tagToBytesLE(Tag.Item), base.intToBytesLE(base.indeterminateLength)),
    itemBE: base.concat(base.tagToBytesBE(Tag.Item), base.intToBytesBE(base.indeterminateLength)),
    item: function(length, bigEndian) { return length === undefined ? bigEndian ? self.itemBE : self.itemLE : base.concat(base.tagToBytes(Tag.Item, bigEndian), base.intToBytes(length, bigEndian)); },

    itemDelimitationLE: base.concat(base.tagToBytesLE(Tag.ItemDelimitationItem), base.intToBytesLE(0x00000000)),
    itemDelimitationBE: base.concat(base.tagToBytesBE(Tag.ItemDelimitationItem), base.intToBytesBE(0x00000000)),
    itemDelimitation: function(bigEndian) { return bigEndian ? self.itemDelimitationBE : self.itemDelimitationLE; },

    sequenceDelimitationLE: base.concat(base.tagToBytesLE(Tag.SequenceDelimitationItem), base.intToBytesLE(0x00000000)),
    sequenceDelimitationBE: base.concat(base.tagToBytesBE(Tag.SequenceDelimitationItem), base.intToBytesBE(0x00000000)),
    sequenceDelimitation: function(bigEndian) { return bigEndian ? self.sequenceDelimitationBE : self.sequenceDelimitationLE; },
    sequenceDelimitationNonZeroLength: function(bigEndian) { return base.concatv(base.tagToBytes(Tag.SequenceDelimitationItem, bigEndian), base.intToBytes(0x00000010, bigEndian)); },

    pixeDataFragments: function(bigEndian) { return base.concatv(base.tagToBytes(Tag.PixelData, bigEndian), Buffer.from("OW"), Buffer.from([0, 0]), base.intToBytes(base.indeterminateLength, bigEndian)) }
};
