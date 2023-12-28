declare namespace _default {
    export namespace subtle {
        function encrypt(algorithm, keyHandle, buffer, ...args: any[]): Promise<any>;
        function decrypt(algorithm, keyHandle, buffer, ...args: any[]): Promise<any>;
        function sign(algorithm, keyHandle, buffer, ...args: any[]): Promise<any>;
        function verify(algorithm, keyHandle, signature, buffer, ...args: any[]): Promise<any>;
        function digest(algorithm, buffer, ...args: any[]): Promise<any>;
        function generateKey(algorithm, extractable, keyUsage, ...args: any[]): Promise<any>;
        function deriveKey(algorithm, baseKey, derivedKeyType, extractable, keyUsage): Promise<any>;
        function deriveBits(algorithm, baseKey, length, ...args: any[]): Promise<any>;
        function importKey(format, keyData, algorithm, extractable, keyUsage, ...args: any[]): Promise<any>;
        function exportKey(format, keyHandle): Promise<any>;
        function wrapKey(format, key, wrappingKey, wrappingKeyAlgorithm): Promise<any>;
        function unwrapKey(format, wrappedKey, unwrappingKey, unwrapAlgorithm, unwrappedKeyAlgorithm, extractable, keyUsages): Promise<any>;
    }
    export function getRandomValues(array);
    export function initPrng(entropyData): void;
    export function toBase64(data, base64Url): string;
    export function fromBase64(base64String): number[];
    export function textToBytes(text): any[];
    export function bytesToText(byteArray): string;
    export { asn1 };
    export { scriptUrl as url };
    export { msrCryptoVersion as version };
    export function useWebWorkers(useWebWorkers);
}
export default _default;
declare namespace asn1 {
    export { parse };
    export { encode };
    export function toString(objTree): string;
}
declare let scriptUrl: string;
declare let msrCryptoVersion: string;
declare function parse(bytes, force);
declare function encode(asn1tree): void;
