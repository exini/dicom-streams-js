/// <reference types="node" />
declare module 'dicom-character-set' {
    export const characterSets: Record<string, unknown>[];
    export function convertBytes(specificCharacterSet: any, bytes: any, options: any): string;
}
