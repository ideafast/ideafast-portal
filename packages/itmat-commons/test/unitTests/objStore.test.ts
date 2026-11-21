/**
 * @with Minio
 */

import { ObjectStore } from '../../src/utils';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { Readable } from 'stream';

const ACCESS_KEY = 'minioadmin';
const SECRET_KEY = 'minioadmin';
const HOST = 'localhost';

declare const global: typeof globalThis & {
    hasMinio: boolean;
    minioContainerPort: number;
};

if (global.hasMinio) describe('OBJECT STORE CLASS TESTS', () => {
    let client: ObjectStore;
    beforeEach(async () => {
        client = new ObjectStore();
        await client.connect({
            host: HOST,
            port: global.minioContainerPort,
            accessKey: ACCESS_KEY,
            secretKey: SECRET_KEY,
            useSSL: false
        });
    });

    test('Connect to store', async () => {
        const objstore = new ObjectStore();
        const connectresult = await objstore.connect({
            host: HOST,
            port: global.minioContainerPort,
            accessKey: ACCESS_KEY,
            secretKey: SECRET_KEY,
            bucketRegion: 'test-bucket',
            useSSL: false
        });
        expect(connectresult).toEqual([]);
    });

    test('Upload file where studyId bucket doesnt exist yet', async () => {
        const uploadResult = await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile.txt')),
            'fakeStudy1',
            '1459034jf9jdklsafj2ojffo-qj-s0fjds0fa'
        );
        expect(typeof uploadResult).toBe('string');
    });

    test('Upload file where studyId bucket already exists', async () => {
        await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile.txt')),
            'fakeStudy2',
            '145safj2ojffo-qj-sdfsad0fjds0fafdsj21'
        );

        const uploadResult = await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile.txt')),
            'fakeStudy2',
            '145safd0445klfsaj-sdfsad0fjds0fafdsj21'
        );
        expect(typeof uploadResult).toBe('string');
    });

    test('Upload file whose name is duplicated', async () => {
        await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile2.txt')),
            'fakeStudy3',
            'jkfljsdkfjij042rjio2-fi0-ds9a'
        );

        let uploadResult;
        let error: unknown;
        try {
            uploadResult = await client.uploadFile(
                fs.createReadStream(path.join(__dirname, '../files/fakefile.txt')),
                'fakeStudy3',
                'jkfljsdkfjij042rjio2-fi0-ds9a'
            );
        } catch (e) {
            error = e;
        }
        expect(uploadResult).toBeUndefined();
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error)
            expect(error.toString()).toBe('Error: File "jkfljsdkfjij042rjio2-fi0-ds9a" of bucket "fakeStudy3" already exists.');
    });

    test('Download file', async () => {
        await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile2.txt')),
            'fakeStudy3',
            'sdfsad0fjds0fafdsj21'
        );
        const downloadResult = await client.downloadFile(
            'fakeStudy3',
            'sdfsad0fjds0fafdsj21'
        );

        const streamToString = async (inputStream: Readable) => {
            return new Promise((resolve, reject) => {
                let string = '';
                inputStream
                    .on('data', data => { string = `${string}${data.toString()}`; })
                    .on('end', () => { resolve(string); })
                    .on('error', reject);
            });
        };
        expect(await streamToString(downloadResult)).toBe('just a fake file 2.');
    });

    test('Remove file', async () => {
        const uri = 'file-to-remove';
        await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile.txt')),
            'fakeStudy4',
            uri
        );

        await client.removeObject('fakeStudy4', uri);

        await expect(client.downloadFile('fakeStudy4', uri)).rejects.toThrow();
    });

    test('Copy file between buckets', async () => {
        const sourceUri = 'file-to-copy';
        const targetUri = 'copied-file';
        await client.uploadFile(
            fs.createReadStream(path.join(__dirname, '../files/fakefile.txt')),
            'fakeStudy5',
            sourceUri
        );

        await client.copyObject('fakeStudy5', sourceUri, 'fakeStudy6', targetUri);

        const copiedFile = await client.downloadFile('fakeStudy6', targetUri);
        const chunks: Buffer[] = [];
        for await (const chunk of copiedFile) {
            chunks.push(Buffer.from(chunk));
        }
        expect(Buffer.concat(chunks).toString()).toBe('just a fake file.');
    });

    test('Copy file larger than the compose split threshold without corruption', async () => {
        const sourceUri = 'large-file-to-copy';
        const targetUri = 'large-file-copied';
        const fileSize = 700_000_000;
        const chunkSize = 1024 * 1024;
        const expectedHash = crypto.createHash('sha256');

        async function* generateFile() {
            let offset = 0;
            let chunkIndex = 0;
            while (offset < fileSize) {
                const size = Math.min(chunkSize, fileSize - offset);
                const chunk = Buffer.alloc(size, chunkIndex % 251);
                chunk.writeUInt32BE(chunkIndex, 0);
                expectedHash.update(chunk);
                yield chunk;
                offset += size;
                chunkIndex++;
            }
        }

        await client.uploadFile(Readable.from(generateFile()), 'large-copy-source', sourceUri, fileSize);
        await client.copyObject('large-copy-source', sourceUri, 'large-copy-target', targetUri);

        const copiedFile = await client.downloadFile('large-copy-target', targetUri);
        const actualHash = crypto.createHash('sha256');
        let actualSize = 0;
        for await (const chunk of copiedFile) {
            actualSize += chunk.length;
            actualHash.update(chunk);
        }

        expect(actualSize).toBe(fileSize);
        expect(actualHash.digest('hex')).toBe(expectedHash.digest('hex'));
    }, 180_000);

    test('Stream copies files above the single-copy size limit', async () => {
        const sourceStream = Readable.from(Buffer.from('source stream'));
        const fileSize = 5 * 1024 * 1024 * 1024 + 1;
        const minioClient = {
            bucketExists: jest.fn().mockResolvedValue(true),
            statObject: jest.fn().mockResolvedValue({ size: fileSize }),
            copyObject: jest.fn(),
            getObject: jest.fn().mockResolvedValue(sourceStream),
            putObject: jest.fn().mockResolvedValue({ etag: 'streamed-etag' })
        };
        const objectStore = new ObjectStore();
        Object.assign(objectStore, { client: minioClient });

        const result = await objectStore.copyObject('source-bucket', 'source.bin', 'target-bucket', 'target.bin');

        expect(result).toBe('streamed-etag');
        expect(minioClient.copyObject).not.toHaveBeenCalled();
        expect(minioClient.getObject).toHaveBeenCalledWith('source-bucket', 'source.bin');
        expect(minioClient.putObject).toHaveBeenCalledWith('target-bucket', 'target.bin', sourceStream, fileSize);
    });
}); else test(`${__filename.split(/[\\/]/).pop()} skipped because it requires Minio on Docker`, () => {
    expect(true).toBe(true);
});
