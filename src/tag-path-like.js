class TagPathLike {

    tag() { throw new Error("Not implemented"); };

    previous() { throw new Error("Not implemented"); };

    isEmpty() { throw new Error("Not implemented"); };

    isRoot() { return this.previous().isEmpty(); };

    toList() {
        let toListRec = function (path, list) {
            if (!path.isRoot()) toListRec(path.previous(), list);
            list.push(path);
            return list;
        };
        return toListRec(this, []);
    }

    contains(tag) { return this.toList().map(tp => tp.tag()).indexOf(tag) >= 0; }

    depth() {
        let depthRec = function (path, d) {
            if (path.isRoot())
                return d;
            else
                return depthRec(path.previous(), d + 1);
        };
        return this.isEmpty() ? 0 : depthRec(this, 1);
    }

    head() { return this.take(1); }

    tail() { return this.drop(1); }

    take(n) {
        let takeRec = function (path, i) {
            return i <= 0 ? path : takeRec(path.previous(), i - 1);
        };
        return takeRec(this, this.depth() - n);
    }

   drop(n) { throw new Error("Not implemented"); }

}

module.exports = {
    TagPathLike: TagPathLike
};
