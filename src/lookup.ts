import { Tag } from './tag';
import { TagToVR } from './tag-to-vr';
import { VR } from './vr';

export class Lookup {
    public static keywords = Object.keys(Tag);

    public static keywordOf(tag: number): string {
        if ((tag & 0x0000ffff) === 0 && (tag & 0xfffd0000) !== 0) {
            return 'GroupLength';
        }
        if ((tag & 0x00010000) !== 0) {
            if ((tag & 0x0000ff00) === 0 && (tag & 0x000000f0) !== 0) {
                return 'PrivateCreatorID';
            }
            return '';
        }
        if ((tag & 0xffffff00) === Tag.SourceImageIDs) {
            return 'SourceImageIDs';
        }
        let tag2 = tag;
        if ((tag & 0xffe00000) === 0x50000000 || (tag & 0xffe00000) === 0x60000000) {
            tag2 = tag & 0xffe0ffff;
        } else if ((tag & 0xff000000) === 0x7f000000 && (tag & 0xffff0000) !== 0x7fe00000) {
            tag2 = tag & 0xff00ffff;
        }
        return Object.keys(Tag).find((key) => Tag[key] === tag2);
    }

    public static vrOf(tag: number): VR {
        return TagToVR.vrOf(tag);
    }

    public static tagOf(keyword: string): number {
        const tag = Tag[keyword] as number;
        if (tag === undefined) {
            throw Error('Unknown keyword ' + keyword);
        }
        return tag;
    }
}
