import assert from 'assert';
import { createNameBasedUID, createNameBasedUIDFromRoot, createUID, createUIDFromRoot } from '../src/base';

describe('Creating a UID', () => {
    it('should create a random UID', () => {
        const uid = createUID();
        assert.strictEqual(uid.substring(0, 4), '2.25');
        assert(/([0-9]+\.)+[0-9]+/.test(uid));
        assert.notStrictEqual(createUID(), uid);
    });

    it('should create a random UID with specified root', () => {
        const uid = createUIDFromRoot('6.66.666');
        assert.strictEqual(uid.substring(0, 8), '6.66.666');
    });

    it('should create a name based UID', () => {
        const uid1 = createNameBasedUID('name');
        const uid2 = createNameBasedUID('name');
        assert.strictEqual(uid1.substring(0, 4), '2.25');
        assert.strictEqual(uid1, uid2);
    });

    it('should create a name based UID with specified root', () => {
        const uid1 = createNameBasedUIDFromRoot('name', '6.66.666');
        const uid2 = createNameBasedUIDFromRoot('name', '6.66.666');
        assert.strictEqual(uid1.substring(0, 8), '6.66.666');
        assert.strictEqual(uid1, uid2);
    });
});
