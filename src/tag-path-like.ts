export abstract class TagPathLike<T extends TagPathLike<T>> {
    public abstract tag(): number;

    public abstract previous(): T;

    public abstract isEmpty(): boolean;

    public isRoot(): boolean {
        return this.previous().isEmpty();
    }

    public toList(): T[] {
        const toListRec = (path: any, list: T[]): T[] => {
            if (!path.isRoot()) {
                toListRec(path.previous(), list);
            }
            list.push(path);
            return list;
        };
        return toListRec(this, []);
    }

    public contains(tag: number): boolean {
        return (
            this.toList()
                .map((tp) => tp.tag())
                .indexOf(tag) >= 0
        );
    }

    public depth(): number {
        const depthRec = (path: any, d: number): number => {
            if (path.isRoot()) {
                return d;
            } else {
                return depthRec(path.previous(), d + 1);
            }
        };
        return this.isEmpty() ? 0 : depthRec(this, 1);
    }

    public head(): T {
        return this.take(1);
    }

    public tail(): T {
        return this.drop(1);
    }

    public take(n: number): T {
        const takeRec = (path: any, i: number): T => {
            return i <= 0 ? path : takeRec(path.previous(), i - 1);
        };
        return takeRec(this, this.depth() - n);
    }

    public abstract drop(n: number): T;
}
