import { parsePersonName } from './value';
import { multiValueDelimiter, trim } from './base';

export class ComponentGroup {
    constructor(public alphabetic: string, public ideographic: string = '', public phonetic: string = '') {}
}

export class PersonName {
    constructor(
        public familyName: ComponentGroup,
        public givenName: ComponentGroup,
        public middleName: ComponentGroup = new ComponentGroup(''),
        public prefix: ComponentGroup = new ComponentGroup(''),
        public suffix: ComponentGroup = new ComponentGroup(''),
    ) {}

    static parse(s: string): PersonName[] {
        return s
            .split(multiValueDelimiter)
            .map(trim)
            .map((s1) => parsePersonName(s1));
    }

    toString(): string {
        const components = [this.familyName, this.givenName, this.middleName, this.prefix, this.suffix];
        const representations = ['alphabetic', 'ideographic', 'phonetic'] as const;
        return representations
            .map((repr) => {
                return components
                    .map((c) => c[repr])
                    .join('^')
                    .replace(/\^+$/, ''); // Trim trailing ^ separators
            })
            .join('=')
            .replace(/=+$/, ''); // Trim trailing = separators
    }
}
