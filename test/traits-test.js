const assert = require("assert");
const Trait = require("traits.js");

/* Test/demonstration that stackable traits in Scala can be implemented in traits.js */

/* Specification */
const IntQueue = Trait({
    get: Trait.required,
    put: Trait.required
});

/* Talent 1 */
function Doubling(Upstream) {
    return Trait.compose(
        Trait.resolve({put: "doublingPut"}, Upstream),
        Trait({
            put: function (x) {
                this.doublingPut(x * 2);
            }
        })
    );
}

/* Talent 2 */
function Adding(Upstream) {
    return Trait.compose(
        Trait.resolve({put: "addingPut"}, Upstream),
        Trait({
            put: function (x) {
                this.addingPut(x + 2);
            }
        })
    );
}

/* Base implementation */
const BasicIntQueue = Trait.compose(
    IntQueue,
    Trait({
        data: {value: []},
        get: function () {
            return this.data.value.shift();
        },
        put: function (x) {
            this.data.value.push(x);
        }
    })
);

const flowModel = function (base, ...talents) { return talents.reduce((out, cap) => Trait.compose(cap(out)), base); };
const toFlow = function (model) { return Trait.create(Object.prototype, model); };
const flow = function (base, ...talents) { return toFlow(flowModel(base, ...talents)); };

const doubleAdd = flow(BasicIntQueue, Adding, Doubling);
const addDouble = flow(BasicIntQueue, Doubling, Adding);

doubleAdd.put(10);
addDouble.put(10);

describe("Javascript traits", function () {
    it("should linearize calls to super", function () {
        assert.equal(doubleAdd.get(), 22); // 10 * 2 + 2
        assert.equal(addDouble.get(), 24); // (10 + 2) * 2
    });
});
