import assert from 'assert';
import { Lookup } from '../src/lookup';
import { Tag } from '../src/tag';
import { UID } from '../src/uid';
import { VR } from '../src/vr';

describe('The DICOM dictionary', () => {
    it('should support getting the value representation for a tag', () => {
        assert.strictEqual(Lookup.vrOf(Tag.PatientName), VR.PN);
    });

    it('should support getting the keyword for a tag', () => {
        assert.strictEqual(Lookup.keywordOf(Tag.PatientName), 'PatientName');
        assert.strictEqual(Lookup.keywordOf(0x00031141), '');
    });

    it('should support getting the tag for a keyword', () => {
        assert.strictEqual(Lookup.tagOf('PatientName'), Tag.PatientName);
        assert.strictEqual(Lookup.tagOf('not-a-keyword'), undefined);
    });

    it('should support listing all keywords', () => {
        assert(Lookup.keywords.length > 4000);
        assert(Lookup.keywords.includes('PatientName'));
    });

    it('should support getting the name for a UID', () => {
        assert.strictEqual(Lookup.nameOf(UID.NuclearMedicineImageStorage), 'Nuclear Medicine Image Storage');
        assert.strictEqual(Lookup.nameOf('not a UID'), undefined);
    });
});
