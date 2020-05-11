import assert from 'assert';
import { byteSink } from '../src/sinks';
import { singleSource } from '../src/sources';
import { Chunker } from './chunker';
import * as util from './test-util';

describe('A byte sink', () => {
    it('should aggregate bytes', () => {
        const data = Buffer.from([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 5]);

        return util.streamPromise(
            singleSource(data),
            new Chunker(4),
            byteSink((buffer) => {
                assert.deepStrictEqual(buffer, data);
            }),
        );
    });
});
