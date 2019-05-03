class VR {
    constructor(name, code, headerLength, paddingByte) {
        this.name = name;
        this.code = code;
        this.headerLength = headerLength;
        this.paddingByte = paddingByte;
    }
}

const AE = new VR("AE", 0x4145, 8, 0x20);
const AS = new VR("AS", 0x4153, 8, 0x20);
const AT = new VR("AT", 0x4154, 8, 0);
const CS = new VR("CS", 0x4353, 8, 0x20);
const DA = new VR("DA", 0x4441, 8, 0x20);
const DS = new VR("DS", 0x4453, 8, 0x20);
const DT = new VR("DT", 0x4454, 8, 0x20);
const FD = new VR("FD", 0x4644, 8, 0);
const FL = new VR("FL", 0x464c, 8, 0);
const IS = new VR("IS", 0x4953, 8, 0x20);
const LO = new VR("LO", 0x4c4f, 8, 0x20);
const LT = new VR("LT", 0x4c54, 8, 0x20);
const OB = new VR("OB", 0x4f42, 12, 0);
const OD = new VR("OD", 0x4f44, 12, 0);
const OF = new VR("OF", 0x4f46, 12, 0);
const OL = new VR("OL", 0x4f4c, 12, 0);
const OV = new VR("OV", 0x4f56, 12, 0);
const OW = new VR("OW", 0x4f57, 12, 0);
const PN = new VR("PN", 0x504e, 8, 0x20);
const SH = new VR("SH", 0x5348, 8, 0x20);
const SL = new VR("SL", 0x534c, 8, 0);
const SQ = new VR("SQ", 0x5351, 12, 0);
const SS = new VR("SS", 0x5353, 8, 0);
const ST = new VR("ST", 0x5354, 8, 0x20);
const SV = new VR("SV", 0x5356, 12, 0);
const TM = new VR("TM", 0x544d, 8, 0x20);
const UC = new VR("UC", 0x5543, 12, 0x20);
const UI = new VR("UI", 0x5549, 8, 0);
const UL = new VR("UL", 0x554c, 8, 0);
const UN = new VR("UN", 0x554e, 12, 0);
const UR = new VR("UR", 0x5552, 12, 0x20);
const US = new VR("US", 0x5553, 8, 0);
const UT = new VR("UT", 0x5554, 12, 0x20);
const UV = new VR("UV", 0x5556, 12, 0);

const values = [AE, AS, AT, CS, DA, DS, DT, FD, FL, IS, LO, LT, OB, OD, OF, OL, OV, OW, PN, SH, SL, SQ, SS, ST, SV, TM, UC, UI, UL, UN, UR, US, UT, UV];

const map = values.reduce((map, vr) => {
    map[vr.code] = vr;
    return map;
}, {});

module.exports = {
    AE: AE,
    AS: AS,
    AT: AT,
    CS: CS,
    DA: DA,
    DS: DS,
    DT: DT,
    FD: FD,
    FL: FL,
    IS: IS,
    LO: LO,
    LT: LT,
    OB: OB,
    OD: OD,
    OF: OF,
    OL: OL,
    OV: OV,
    OW: OW,
    PN: PN,
    SH: SH,
    SL: SL,
    SQ: SQ,
    SS: SS,
    ST: ST,
    SV: SV,
    TM: TM,
    UC: UC,
    UI: UI,
    UL: UL,
    UN: UN,
    UR: UR,
    US: US,
    UT: UT,
    UV: UV,

    values: values,

    valueOf: function (code) { return map[code]; }
};
