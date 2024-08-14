import {Parser} from './parser';
import { Elements } from './elements';
import {Tag} from "./tag";
import {LocalDate} from "js-joda";
import {pipe} from "./base";
//import {parseFlow} from "./parse-flow";
import {stopTagFlow} from "./dicom-flows";
import {elementFlow} from "./element-flows";
import {elementSink} from "./element-sink";
import {LocalFileData} from "get-file-object-from-local-path";
import {constructFileFromLocalFileData} from "get-file-object-from-local-path";
import * as fs from 'fs';
import {PathLike} from "node:fs";
import { AttributeInfo } from './parsing';

class DicomService {
    constructor() {}

    /**
     * Chunked but non-streaaming parsing of the input file into a DICOM Elements object.
     * @param file File to parse
     * @param chunkSize number of bytes to read at a time, until the end of the file or the stop condition is met.
     *                  If not specified, the entire file will be read
     * @param stop stop condition, based on the current Element and its dataset depth. Argument may be omitted
     */
    getElements(file: File, chunkSize?: number, stop?: (element: any, depth: number) => boolean): Promise<any> {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader()
            const parser = new Parser(stop)
            return chunkSize
                ? this.getElementsRec(file, fileReader, 0, chunkSize, parser, resolve, reject)
                : this.getElementsFull(file, fileReader, parser, resolve, reject)
        })
    }

    /**
     * Recursive inner method for `getElements`
     */
    private getElementsRec(
 
 file: File,
        fileReader: FileReader,
        offset: number,
        chunkSize: number,
        parser: any,
        resolve: (value?: any) => void,
        reject: (value?: any) => void
    ): void {
        const end = Math.min(offset + chunkSize, file.size)
        fileReader.onload = (event: ProgressEvent) => {
            try {
                const chunk = Buffer.from(fileReader.result as ArrayBuffer)
                parser.parse(chunk)
                if (parser.isComplete() || end >= file.size) {
                    resolve(parser.result())
                } else {
                    this.getElementsRec(file, fileReader, offset + chunkSize, chunkSize, parser, resolve, reject)
                }
            } catch (error) {
                reject(error)
            }
        }
        fileReader.onerror = reject
        fileReader.readAsArrayBuffer(file.slice(offset, end))
    }

    /**
     * Alternative inner method for `getElements`
     */
    private getElementsFull(
        file: File,
        fileReader: FileReader,
        parser: any,
        resolve: (value?: any) => void,
        reject: (value?: any) => void
    ): void {
        fileReader.onload = (event: ProgressEvent) => {
            try {
                const chunk = Buffer.from(fileReader.result as ArrayBuffer)
                parser.parse(chunk)
                resolve(parser.result())
            } catch (error) {
                reject(error)
            }
        }
        fileReader.onerror = reject
        fileReader.readAsArrayBuffer(file)
    }

     /**
      * Streaming parsing of the input file into a DICOM Elements object.
      * @param byteStream stream to parse
      * @param chunkSize number of bytes to read at a time, until the end of the stream or the stop condition is met.
      *                  If not specified, the entire stream will be read
      * @param stop stop tag (exclusive, optional)
      */
//     getElementsFromStream(byteStream: NodeJS.ReadableStream, chunkSize?: number, stopTag?: number): Promise<Elements> {
//         return new Promise((resolve, reject) => {
//             const stream = stopTag
//                 ? pipe(byteStream, parseFlow(chunkSize), stopTagFlow(stopTag), elementFlow(), elementSink(resolve))
//                 : pipe(byteStream, parseFlow(chunkSize), elementFlow(), elementSink(resolve))
//             stream.on('error', reject)
//         })
//     }

    /**
     * Get the number of slices/frames given the input information
     * @param info instance infos
     */
    getSlices(elementsList: Elements[]): number | undefined {
        return this.isMultiFrame(elementsList) ? elementsList[0].numberByTag(Tag.NumberOfFrames) : elementsList.length
    }

    // Calculate patient age from birth and scan dates
    calculatePatientAge(elements: Elements): number | undefined {
        const birthDate = elements.dateByTag(Tag.PatientBirthDate)
        const scanDate = elements.dateByTag(Tag.AcquisitionDate) || elements.dateByTag(Tag.SeriesDate) || elements.dateByTag(Tag.StudyDate)
        return birthDate && scanDate ? this.calculatePatientAgeInYears(birthDate, scanDate) : undefined
    }

    private calculatePatientAgeInYears(birthDate: LocalDate, scanDate: LocalDate): number {
        return birthDate.until(scanDate).years()
    }

    /**
     * DICOM series are either single-frame-multi-series (e.g. CT,PT) or single-image-multi-frame (e.g. NM).
     * @param elementsList elements for each instance of the series
     * @returns true if the supplied information indicates a single-image-multi-frame series

     */
    private isMultiFrame(elementsList: Elements[]): boolean {
        return elementsList.length === 1 && !this.isInvalidTagNumber(elementsList[0].numberByTag(Tag.NumberOfFrames))
    }

    private isInvalidTagNumber(value: number | undefined): boolean {
        if (!value) {
            return false
        }
        return isNaN(value)
    }
}

class MyOpenFile {
    private name: string;
    private buffer: Buffer;
    
    public constructor(fileName: string) {
        this.name = fileName;
        this.buffer = fs.readFileSync(fileName);
    }
    
    public getName(): string {
        return this.name;
    }
    
    public size(): number {
        return this.buffer.length;
    }
}

function getElements(file: string, chunkSize?: number, stop?: (element: any, depth: number) => boolean): Promise<any> {
            return new Promise((resolve, reject) => {
//                const fileReader = fs.createReadStream(file)
                const parser = new Parser(stop)
                return getElementsRec(new MyOpenFile(file), 0, chunkSize, parser, resolve, reject)
            })
        }

function getElementsRec(
        file: MyOpenFile,
//        fileReader: FileReader,
        offset: number,
        chunkSize: number,
        parser: any,
        resolve: (value?: any) => void,
        reject: (value?: any) => void
    ): void {
    const end = Math.min(offset + chunkSize, file.size()) - 1
        var fileReader = fs.createReadStream(file.getName(), {start: offset, end: end})
        fileReader.on("data", (data) => {
//            console.log('on some data of length ' + data.length)
            //        fileReader.onload = (event: ProgressEvent) => {
            try {
                const chunk = Buffer.from(data as ArrayBuffer)
                parser.parse(chunk)
                if (parser.isComplete() || end >= file.size() - 1) {
                    console.log("Resolving promise. isComplete %s, end=%d file.size=%d", parser.isComplete(), end, file.size())
                    resolve(parser.result());
                } else {
                    getElementsRec(file, offset + chunkSize, chunkSize, parser, resolve, reject);
                }
            } catch (error) {
                reject(error)
            }
        })
        fileReader.on('error', (err) => {
            reject(err)
        })
        fileReader.on('end', () => {
//            console.log('end - event')
//            console.log('Stream end received. Resolving promise')
            //            resolve(parser.result());
        })
        
//        fileReader.onerror = reject
        fileReader.read();
//        fileReader.readAsArrayBuffer(new Blob([file]).slice(offset, end))
    }
    
console.log('hello world TS!')
const stop = (attributeInfo: AttributeInfo, depth: number): boolean =>
    depth === 0 && 'tag' in attributeInfo && (attributeInfo as any).tag > Tag.PatientName;
getElements('example/image/example-ed.dcm', 8192, stop).then(x =>
//getElements('example/image/example-mini.dcm', 100).then(x =>
//getElements('example/image/example-deflated.dcm', 1).then(x =>
            console.log(x)
)
