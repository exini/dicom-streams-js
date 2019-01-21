base = require("./base");
VR = require("./vr");
UID = require("./uid");
dictionary = require("./dictionary");

const dicomPreambleLength = 132;

function isDICM(bytes) {
    return bytes[0] === 68 && bytes[1] === 73 && bytes[2] === 67 && bytes[3] === 77;
}

function isPreamble(data) {
    return data.length >= dicomPreambleLength && isDICM(data.slice(dicomPreambleLength - 4, dicomPreambleLength));
}

function isFileMetaInformation(tag) {
    return (tag & 0xFFFF0000) === 0x00020000;
}

function isGroupLength(tag) {
    return base.elementNumber(tag) === 0;
}

function isDeflated(transferSyntaxUid) {
    return transferSyntaxUid === UID.DeflatedExplicitVRLittleEndian || transferSyntaxUid === UID.JPIPReferencedDeflate;
}

function tagVr(data, bigEndian, explicitVr) {
    let tag = base.bytesToTag(data, bigEndian);
    if (tag === 0xFFFEE000 || tag === 0xFFFEE00D || tag === 0xFFFEE0DD)
        return {tag: tag, vr: null};
    if (explicitVr)
        return {tag: tag, vr: VR.valueOf(base.bytesToVR(data.slice(4, 6)))};
    return {tag: tag, vr: dictionary.vrOf(tag)};
}

class Info {
    constructor(bigEndian, explicitVR, hasFmi) {
        this.bigEndian = bigEndian;
        this.explicitVR = explicitVR;
        this.hasFmi = hasFmi;
    }
}

function dicomInfo(data, assumeBigEndian) {
    let tag1 = base.bytesToTag(data, assumeBigEndian);
    let vr = dictionary.vrOf(tag1);
    if (vr === VR.UN)
        return undefined;
    if (base.bytesToVR(data.slice(4, 6)) === vr.code)
        return new Info(assumeBigEndian, true, isFileMetaInformation(tag1));
    if (base.bytesToUInt(data.slice(4, 8), assumeBigEndian) >= 0)
        if (assumeBigEndian)
            throw Error("Implicit VR Big Endian encoded DICOM Stream");
        else
            return new Info(false, false, isFileMetaInformation(tag1));
    return undefined;
}

module.exports = {
    dicomPreambleLength: dicomPreambleLength,
    isPreamble: isPreamble,
    isFileMetaInformation: isFileMetaInformation,
    isGroupLength: isGroupLength,
    isDeflated: isDeflated,
    tagVr: tagVr,
    dicomInfo: function (data) {
        let info = dicomInfo(data, false);
        if (!info)
            info = dicomInfo(data, true);
        return info;
    }
};
