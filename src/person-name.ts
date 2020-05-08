import { parsePersonName } from "./value";
import { multiValueDelimiter, trim } from "./base";

// tslint:disable: max-classes-per-file

export class ComponentGroup {
    constructor(
        public alphabetic: string,
        public ideographic: string = "",
        public phonetic: string = ""
    ) { }

    toString(): string {
        return (this.alphabetic + '=' + this.ideographic + '=' + this.phonetic).replace(/=+$/, "");
    }
}

export class PersonName {
    constructor(
        public familyName: ComponentGroup,
        public givenName: ComponentGroup,
        public middleName: ComponentGroup = new ComponentGroup(""),
        public prefix: ComponentGroup = new ComponentGroup(""),
        public suffix: ComponentGroup = new ComponentGroup("")
    ) { }

    static parse(s: string): PersonName[] {
        return s.split(multiValueDelimiter).map(trim).map((s1) => parsePersonName(s1));
    }

    toString(): string {
        return (this.familyName + '^' + this.givenName + '^' + this.middleName + '^' + this.prefix + '^' + this.suffix).replace("/\\^+$/", "");
    }
}
