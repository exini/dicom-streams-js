const assert = require("assert");
const base = require("../src/base");

describe("Creating a UID", function () {
    it("should create a random UID", function () {
        let uid = base.createUID();
        console.log(uid);
        assert.strictEqual(uid.substring(0, 4), "2.25");
        assert(/([0-9]+\.)+[0-9]+/.test(uid));
        assert.notStrictEqual(base.createUID(), uid);
    });

    it("should create a random UID with specified root", function () {
        let uid = base.createUIDFromRoot("6.66.666");
        assert.strictEqual(uid.substring(0, 8), "6.66.666");
    });

    it("should create a name based UID", function () {
        let uid1 = base.createNameBasedUID("name");
        let uid2 = base.createNameBasedUID("name");
        console.log(uid1, uid2);
        assert.strictEqual(uid1.substring(0, 4), "2.25");
        assert.strictEqual(uid1, uid2);
    });

    it("should create a name based UID with specified root", function () {
        let uid1 = base.createNameBasedUIDFromRoot("name", "6.66.666");
        let uid2 = base.createNameBasedUIDFromRoot("name", "6.66.666");
        assert.strictEqual(uid1.substring(0, 8), "6.66.666");
        assert.strictEqual(uid1, uid2);
    });
});

