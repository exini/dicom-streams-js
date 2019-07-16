import {Writable} from "stream";
import { Elements } from "./elements";
import {ElementsBuilder} from "./elements-builder";

export function elementSink(callback: (e: Elements) => void) {
    const builder = new ElementsBuilder();
    const sink = new Writable({
        objectMode: true,
        write(element, encoding, cb) {
            try {
                builder.addElement(element);
                process.nextTick(() => cb());
            } catch (error) {
                process.nextTick(() => this.emit("error", error));
            }
        },
    });
    sink.once("finish", () => {
        callback(builder.result());
    });
    return sink;
}
