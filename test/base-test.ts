import assert from "assert";
import * as base from "../src/base";

describe("Creating a UID", () => {
    it("should create a random UID", () => {
        const uid = base.createUID();
        assert.strictEqual(uid.substring(0, 4), "2.25");
        assert(/([0-9]+\.)+[0-9]+/.test(uid));
        assert.notStrictEqual(base.createUID(), uid);
    });

    it("should create a random UID with specified root", () => {
        const uid = base.createUIDFromRoot("6.66.666");
        assert.strictEqual(uid.substring(0, 8), "6.66.666");
    });

    it("should create a name based UID", () => {
        const uid1 = base.createNameBasedUID("name");
        const uid2 = base.createNameBasedUID("name");
        assert.strictEqual(uid1.substring(0, 4), "2.25");
        assert.strictEqual(uid1, uid2);
    });

    it("should create a name based UID with specified root", () => {
        const uid1 = base.createNameBasedUIDFromRoot("name", "6.66.666");
        const uid2 = base.createNameBasedUIDFromRoot("name", "6.66.666");
        assert.strictEqual(uid1.substring(0, 8), "6.66.666");
        assert.strictEqual(uid1, uid2);
    });
});
