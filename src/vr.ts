export class VR {

    public static AE = new VR("AE", 0x4145, 8, 0x20);
    public static AS = new VR("AS", 0x4153, 8, 0x20);
    public static AT = new VR("AT", 0x4154, 8, 0);
    public static CS = new VR("CS", 0x4353, 8, 0x20);
    public static DA = new VR("DA", 0x4441, 8, 0x20);
    public static DS = new VR("DS", 0x4453, 8, 0x20);
    public static DT = new VR("DT", 0x4454, 8, 0x20);
    public static FD = new VR("FD", 0x4644, 8, 0);
    public static FL = new VR("FL", 0x464c, 8, 0);
    public static IS = new VR("IS", 0x4953, 8, 0x20);
    public static LO = new VR("LO", 0x4c4f, 8, 0x20);
    public static LT = new VR("LT", 0x4c54, 8, 0x20);
    public static OB = new VR("OB", 0x4f42, 12, 0);
    public static OD = new VR("OD", 0x4f44, 12, 0);
    public static OF = new VR("OF", 0x4f46, 12, 0);
    public static OL = new VR("OL", 0x4f4c, 12, 0);
    public static OV = new VR("OV", 0x4f56, 12, 0);
    public static OW = new VR("OW", 0x4f57, 12, 0);
    public static PN = new VR("PN", 0x504e, 8, 0x20);
    public static SH = new VR("SH", 0x5348, 8, 0x20);
    public static SL = new VR("SL", 0x534c, 8, 0);
    public static SQ = new VR("SQ", 0x5351, 12, 0);
    public static SS = new VR("SS", 0x5353, 8, 0);
    public static ST = new VR("ST", 0x5354, 8, 0x20);
    public static SV = new VR("SV", 0x5356, 12, 0);
    public static TM = new VR("TM", 0x544d, 8, 0x20);
    public static UC = new VR("UC", 0x5543, 12, 0x20);
    public static UI = new VR("UI", 0x5549, 8, 0);
    public static UL = new VR("UL", 0x554c, 8, 0);
    public static UN = new VR("UN", 0x554e, 12, 0);
    public static UR = new VR("UR", 0x5552, 12, 0x20);
    public static US = new VR("US", 0x5553, 8, 0);
    public static UT = new VR("UT", 0x5554, 12, 0x20);
    public static UV = new VR("UV", 0x5556, 12, 0);

    public static values = [
        VR.AE, VR.AS, VR.AT, VR.CS, VR.DA, VR.DS, VR.DT, VR.FD, VR.FL, VR.IS, VR.LO, VR.LT, VR.OB, VR.OD, VR.OF, VR.OL,
        VR.OV, VR.OW, VR.PN, VR.SH, VR.SL, VR.SQ, VR.SS, VR.ST, VR.SV, VR.TM, VR.UC, VR.UI, VR.UL, VR.UN, VR.UR, VR.US,
        VR.UT, VR.UV,
    ];

    public static valueOf(code: number): VR { return VR.map.get(code); }

    private static map: Map<number, VR> = VR.values.reduce((m: Map<number, VR>, vr: VR) => {
        m.set(vr.code, vr);
        return m;
    }, new Map<number, VR>());

    constructor(
        public readonly name: string,
        public readonly code: number,
        public readonly headerLength: number,
        public readonly paddingByte: number) {}
}
