/// <reference types="node" />
declare module "dicom-character-set/dist/dicom-character-set-no-polyfill" {
    export const characterSets: {}[];
    export function convertBytes(specificCharacterSet: any, bytes: any, options: any): string;
}
