import { createTRPCReact } from '@trpc/react-query';

// eslint-disable-next-line @nx/enforce-module-boundaries
import type { AppRouter } from '../../../itmat-interface/src/server/router';
import { RcFile } from 'antd/es/upload';
import { z } from 'zod';

export const trpc = createTRPCReact<AppRouter>();

// export function convertRCFileToSchema(rcFile): { fileBuffer: Buffer; filename: string; mimetype: string; size: number; } {
//     return {
//         fileBuffer: Buffer.from(rcFile.fileData),  // assuming rcFile.fileData contains the file data
//         filename: rcFile.filename,
//         mimetype: rcFile.mimetype,
//         size: rcFile.fileSize // or whatever property that contains the file size in RCFile
//         // ... other conversions ...
//     };
// }
interface FileSchema {
    fileBuffer: {
        data: number[];
        type: 'Buffer';
    };
    filename: string;
    mimetype: string;
    size: number;
}

export const convertRCFileToSchema = async (rcFile: RcFile): Promise<FileSchema> => {
    const arrayBuffer: ArrayBuffer = await rcFile.arrayBuffer();
    const bufferArray = new Uint8Array(arrayBuffer);
    const fileBuffer = Buffer.from(bufferArray);

    // Convert the Buffer to the expected format
    const fileBufferObject = {
        data: Array.from(fileBuffer),
        type: 'Buffer' as const // Ensure 'type' is exactly "Buffer"
    };

    return {
        fileBuffer: fileBufferObject,
        filename: rcFile.name,
        mimetype: rcFile.type,
        size: rcFile.size
    };
};

// Rest of your code...



// export async function convertRCFileToSchema(rcFile): Promise<FileSchema> {
//     return new Promise((resolve, reject) => {
//         const reader = new FileReader();
//         reader.onload = (event) => {
//             if (event.target) {
//                 const arrayBuffer = event.target.result as ArrayBuffer;
//                 const fileBuffer = Buffer.from(arrayBuffer);  // Convert ArrayBuffer to Buffer
//                 resolve({
//                     fileBuffer,
//                     filename: rcFile.name,
//                     mimetype: rcFile.type,
//                     size: rcFile.size
//                 });
//             } else {
//                 reject(new Error('FileReader onload event.target is null'));
//             }
//         };
//         reader.onerror = (error) => {
//             reject(error);
//         };
//         reader.readAsArrayBuffer(rcFile);
//     });
// }






// export async function convertRCFileToSchema(rcFile: RcFile): Promise<{
//     fileBuffer: Buffer;
//     filename: string;
//     mimetype: string;
//     size: number;
// }> {
//     const fileBuffer = await blobToBuffer(rcFile);
//     const filename = rcFile.name;
//     const mimetype = rcFile.type || 'application/octet-stream';
//     const size = rcFile.size;

//     return {
//         fileBuffer,
//         filename,
//         mimetype,
//         size
//     };
// }

// function blobToBuffer(blob: Blob): Promise<Buffer> {
//     return new Promise((resolve, reject) => {
//         const reader = new FileReader();
//         reader.onloadend = () => {
//             const arrayBuffer = reader.result;
//             if (arrayBuffer instanceof ArrayBuffer) {
//                 resolve(Buffer.from(arrayBuffer));
//             } else {
//                 reject(new Error('Failed to convert Blob to ArrayBuffer'));
//             }
//         };
//         reader.onerror = () => {
//             reject(new Error('Failed to read Blob'));
//         };
//         reader.readAsArrayBuffer(blob);
//     });
// }
