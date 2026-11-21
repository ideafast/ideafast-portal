import crypto from 'crypto';
import { PassThrough } from 'stream';
import { objStore } from '../../src/objStore/objStore';
import { streamFileToStaging } from '../../src/server/commonMiddleware';

describe('study file upload stream', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('forwards chunks to object storage before the source file ends', async () => {
        const source = new PassThrough();
        let firstChunkReceived: (() => void) | undefined;
        const receivedFirstChunk = new Promise<void>(resolve => {
            firstChunkReceived = resolve;
        });
        const chunks: Buffer[] = [];
        jest.spyOn(objStore, 'uploadFile').mockImplementation(async stream => {
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk));
                firstChunkReceived?.();
            }
            return 'etag';
        });

        const upload = streamFileToStaging(source, 'large-file.txt');
        source.write(Buffer.from('first chunk'));
        await receivedFirstChunk;
        expect(chunks).toHaveLength(1);

        source.end(Buffer.from('second chunk'));
        const result = await upload;
        const contents = Buffer.concat(chunks);
        expect(contents.toString()).toBe('first chunksecond chunk');
        expect(result.fileSize).toBe(contents.length);
        expect(result.hash).toBe(crypto.createHash('sha256').update(contents).digest('hex'));
    });
});
