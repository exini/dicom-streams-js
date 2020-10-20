/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Transform, TransformOptions } from 'stream';

export abstract class Detour extends Transform {
    private detour = false;

    constructor(private readonly options: TransformOptions, private detourFlow?: Transform) {
        super(options);
        if (detourFlow) {
            this.setDetourFlow(detourFlow);
        }
    }

    public setDetourFlow(detourFlow: Transform): void {
        this.detourFlow = detourFlow;
    }

    public setDetour(detour = true, initialChunk?: any): void {
        this.detour = detour;
        if (this.detourFlow !== undefined) {
            if (this.detour) {
                this.detourFlow.on('data', (chunk) => this.process(chunk));
                this.detourFlow.once('end', () => this.cleanup());
                this.detourFlow.once('error', (error) => this.emit('error', error));
            } else {
                this.detourFlow.end();
            }
        }
        if (initialChunk !== undefined && (initialChunk.length === undefined || initialChunk.length > 0)) {
            if (detour && this.detourFlow !== undefined) {
                this.detourFlow.write(initialChunk);
            } else {
                this.write(initialChunk);
            }
        }
    }

    public abstract process(chunk: any): void;

    public cleanup(): void {
        // override to add custom cleanup code
    }

    public _transform(chunk: any, encoding: string, callback: (error?: Error, data?: any) => void): void {
        if (this.detour !== undefined && this.detourFlow !== undefined) {
            if (!this.detourFlow.write(chunk)) {
                this.detourFlow.once('drain', callback);
            } else {
                process.nextTick(() => callback());
            }
        } else {
            this.process(chunk);
            callback();
        }
    }

    public _flush(callback: (error?: Error, data?: any) => void): void {
        if (this.detour && this.detourFlow) {
            this.detourFlow.once('end', callback);
            this.detourFlow.end();
        } else {
            this.cleanup();
            process.nextTick(() => callback());
        }
    }
}
