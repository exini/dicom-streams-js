const base = require("./base");
const VR = require("./vr");
const Lookup = require("./lookup");

const self = module.exports ={
    dicomPreambleLength: 132,

    isDICM: function(bytes) {
        return bytes[0] === 68 && bytes[1] === 73 && bytes[2] === 67 && bytes[3] === 77;
    },

    tryReadHeader: function(data) {
        const info = self.dicomInfo(data, false);
        return info === undefined ? self.dicomInfo(data, true) : info;
    },

    dicomInfo: function(data, assumeBigEndian) {
        const tag = base.bytesToTag(data, assumeBigEndian);
        const vr = Lookup.vrOf(tag);
        if (vr === VR.UN || base.groupNumber(tag) !== 2 && base.groupNumber(tag) < 8)
            return undefined;
        if (base.bytesToVR(data.slice(4, 6)) === vr.code)
            return { bigEndian: assumeBigEndian, explicitVR: true, hasFmi: base.isFileMetaInformation(tag) };
        if (base.bytesToUInt(data.slice(4, 8), assumeBigEndian) >= 0)
            if (assumeBigEndian)
                throw Error("Implicit VR Big Endian encoded DICOM Stream");
            else
                return { bigEndian: false, explicitVR: false, hasFmi: base.isFileMetaInformation(tag) };
        return undefined;
    },

    isPreamble: function(data) {
        return data.length >= self.dicomPreambleLength && self.isDICM(data.slice(self.dicomPreambleLength - 4, self.dicomPreambleLength));
    },

    readTagVr: function(data, bigEndian, explicitVr) {
        let tag = base.bytesToTag(data, bigEndian);
        if (tag === 0xFFFEE000 || tag === 0xFFFEE00D || tag === 0xFFFEE0DD)
            return {tag: tag, vr: null};
        if (explicitVr)
            return {tag: tag, vr: VR.valueOf(base.bytesToVR(data.slice(4, 6)))};
        return {tag: tag, vr: Lookup.vrOf(tag)};
    },
    
    readHeader: function(reader, state) {
        reader.ensure(8);
        let tagVrBytes = reader.remainingData().slice(0, 8);
        let tagVr = self.readTagVr(tagVrBytes, state.bigEndian, state.explicitVR);
        if (tagVr.vr && state.explicitVR) {
            if (tagVr.vr.headerLength === 8)
                return {
                    tag: tagVr.tag,
                    vr: tagVr.vr,
                    headerLength: 8,
                    valueLength: base.bytesToUShort(tagVrBytes.slice(6), state.bigEndian)
                };
            reader.ensure(12);
            return {
                tag: tagVr.tag,
                vr: tagVr.vr,
                headerLength: 12,
                valueLength: base.bytesToUInt(reader.remainingData().slice(8), state.bigEndian)
            };
        }
        return {
            tag: tagVr.tag,
            vr: tagVr.vr,
            headerLength: 8,
            valueLength: base.bytesToUInt(tagVrBytes.slice(4), state.bigEndian)
        };
    }
    
};
