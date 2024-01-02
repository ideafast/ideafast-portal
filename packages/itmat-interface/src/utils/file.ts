import { type } from 'os';

export interface SerializedBuffer {
    type: string;
    data: number[];
}

export function isSerializedBuffer(obj: any): obj is SerializedBuffer {
    return obj && obj.type === 'Buffer' && Array.isArray(obj.data);
}



export function convertSerializedBufferToBuffer(serializedBuffer: SerializedBuffer): Buffer {
    return Buffer.from(serializedBuffer.data);
}

export function parseJsonOrString(input: any): any {
    if (!input) {
        return undefined;
    }
    if (typeof input === 'string') {
        try {
            return JSON.parse(input);
        } catch (error) {
            console.error('Invalid JSON string:', error);
            return null; // or handle the error as appropriate
        }
    } else if (typeof input === 'object' && input !== null) {
        // Assuming the input is already a JSON object
        return input;
    } else {
        // Handle other data types if needed
        console.error('Input is neither a JSON object nor a JSON string.');
        return null; // or handle as appropriate
    }
}