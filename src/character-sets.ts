/* eslint-disable @typescript-eslint/no-use-before-define */
import { convertBytes } from 'dicom-character-set';
import { VR } from './vr';

export class CharacterSets {
    public static isVrAffectedBySpecificCharacterSet(vr: VR): boolean {
        return vr === VR.LO || vr === VR.LT || vr === VR.PN || vr === VR.SH || vr === VR.ST || vr === VR.UT;
    }

    public static fromNames(names: string): CharacterSets {
        return new CharacterSets(names);
    }

    public static fromBytes(specificCharacterSetBytes: Buffer): CharacterSets {
        return !specificCharacterSetBytes || specificCharacterSetBytes.length === 0
            ? defaultCharacterSet
            : new CharacterSets(specificCharacterSetBytes.toString());
    }

    public static encode(s: string): Buffer {
        return Buffer.from(s, 'utf8');
    }

    public static defaultOnly(): CharacterSets {
        return new CharacterSets('');
    }

    constructor(public readonly charsets: string) {}

    public decode(bytes: Buffer, vr: VR): string {
        try {
            return convertBytes(this.charsets, bytes, { vr: vr.name });
        } catch (err) {
            console.warn('Invalid character set: ' + this.charsets + ', using default instead.');
            return defaultCharacterSet.decode(bytes, vr);
        }
    }

    public toString(): string {
        return 'CharacterSets [' + this.charsets.split('\\').join(',') + ']';
    }
}

export const defaultCharacterSet = CharacterSets.defaultOnly();
