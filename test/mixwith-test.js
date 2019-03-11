const assert = require("assert");
const {mix, wrap, Mixin} = require("mixwith");
/* Test/demonstration that stackable traits in Scala can be implemented in traits.js */

/* Specification */
class IntQueue {
    get() { throw Error("Must implement"); }
    put(x) { throw Error("Must implement"); }
}

/* Base implementation */
class BasicIntQueue extends IntQueue {
    constructor() {
        super();
        this.data = [];
    }

    get() {
        return this.data.shift();
    }

    put(x) {
        this.data.push(x);
    }
}

/* Talent 1 */
const Doubling = (superclass) => class extends superclass {
    put(x) { super.put(x * 2); }
};

/* Talent 2 */
const Adding = (superclass) => class extends superclass {
    put(x) { super.put(x + 2); }
};


class DoubleAdd extends mix(BasicIntQueue).with(Adding, Doubling) {}
class AddDouble extends mix(BasicIntQueue).with(Doubling, Adding) {}

const doubleAdd = new DoubleAdd();
const addDouble = new AddDouble();

doubleAdd.put(10);
addDouble.put(10);

describe("Javascript traits", function () {
    it("should linearize calls to super", function () {
        assert.equal(doubleAdd.get(), 22); // 10 * 2 + 2
        assert.equal(addDouble.get(), 24); // (10 + 2) * 2
    });
});

function createDeDupe() {
    let seen = [];
    return (mixin) => wrap(mixin, (superclass) => {
        if (seen.indexOf(superclass)) {
            return superclass;
        }
        return mixin(superclass);
    }
}
const DeDupe = (mixin) => wrap(mixin, (superclass) => {
    if (mixinAlreadyApplied(superclass)) {
        return superclass;
    }
    return mixin(superclass);
});

class WithLegs {
    legs() { return "Base"; };
}

const TwoLegged = DeDupe(Mixin((superclass) => class extends superclass {
    legs() { return "Two -> " + super.legs(); }
}));
const FourLegged = DeDupe(Mixin((superclass) => class extends superclass {
    legs() { return "Four -> " + super.legs(); }
}));
const SixLegged = DeDupe(Mixin((superclass) => class extends mix(superclass).with(TwoLegged) {
    legs() { return "Six -> " + super.legs(); }
}));

class A extends mix(WithLegs).with(TwoLegged,  FourLegged           ) { legs() { return "A -> " + super.legs(); } }
class B extends mix(WithLegs).with(FourLegged, TwoLegged            ) { legs() { return "B -> " + super.legs(); } }
class C extends mix(WithLegs).with(SixLegged,  FourLegged, TwoLegged) { legs() { return "C -> " + super.legs(); } }
class D extends mix(WithLegs).with(FourLegged, SixLegged,  TwoLegged) { legs() { return "D -> " + super.legs(); } }

describe("A more complex example", function () {
    it("Class extending TwoLegged with FourLegged should return A -> Four -> Two -> Base", function () {
        assert.equal(new A().legs(), "A -> Four -> Two -> Base");
    });
    it("Class extending FourLegged with TwoLegged should return B -> Two -> Four -> Base", function () {
        assert.equal(new B().legs(), "B -> Two -> Four -> Base");
    });
    it("Class extending TwoLegged with FourLegged should return C -> Two -> Four -> Six -> Base", function () {
        assert.equal(new C().legs(), "C -> Two -> Four -> Six -> Base");
    });
    it("Class extending TwoLegged with FourLegged should return Four -> Two -> Base", function () {
        assert.equal(new D().legs(), "D -> SixLegged -> TwoLegged -> FourLegged -> Base");
    });
});
