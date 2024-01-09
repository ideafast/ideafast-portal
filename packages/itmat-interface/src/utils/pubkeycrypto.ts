import crypto from 'crypto';
import jwt, { Algorithm } from 'jsonwebtoken';

export function rsasigner(privateKey: string, message: string, scheme = 'RSA-SHA256', passphrase = 'idea-fast'): string {
    try {
        const signer = crypto.createSign(scheme);
        // Signing
        signer.update(message);

        // The signature output_format: HexBase64Latin1Encoding which can be either 'binary', 'hex' or 'base64'
        const signature = signer.sign({
            key: privateKey,
            passphrase: passphrase
        }, 'base64');
        signer.end();
        return signature;
    }
    catch (err: any) {
        return err;
    }
}

export function hashdigest(message: string, method = 'sha256'): string {
    const hash = crypto.createHash(method);
    hash.update(message);
    return hash.copy().digest('base64');
}

export function reGenPkfromSk(privateKey: string, passphrase = 'idea-fast'): string {
    try {
        const skObject = crypto.createPrivateKey({
            key: privateKey,
            type: 'pkcs8',
            format: 'pem',
            passphrase: passphrase
        });

        const pkObject = crypto.createPublicKey(skObject);
        const reGenPk = pkObject.export({
            format: 'pem',
            type: 'spki'
        });
        return reGenPk.toString('base64');
    }
    catch (err: any) {
        return err;
    }
}

export async function rsaverifier(pubkey: string, signature: string, message = '', scheme = 'RSA-SHA256') {
    let messageToBeVerified = message;
    const ec = new TextEncoder();
    const pkObject = crypto.createPublicKey({
        key: pubkey,
        type: 'spki',
        format: 'pem'
    });

    if (message === '') {
        //default message = hash of the public key (SHA256). Re-generate the message = hash of the public key
        const hash = crypto.createHash('sha256');
        hash.update(ec.encode(pubkey));
        messageToBeVerified = hash.digest('base64');
    }

    const result = crypto.verify(
        scheme,
        Buffer.from(messageToBeVerified, 'base64'),
        {
            key: pkObject,
            saltLength: 32,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING
        },
        Buffer.from(signature, 'base64')
    );
    return result;
}

export async function rsaSigner_test(privateKey: string, signature: string, message = 'abc', scheme = 'RSA-SHA256') {

    const ec = new TextEncoder();

    const hash3 = crypto.createHash('sha256');
    hash3.update(ec.encode(message));
    const messagetobeSigned = hash3.digest('base64');

    const skObject = crypto.createPrivateKey({
        key: privateKey,
        type: 'pkcs8',
        format: 'pem'
    });

    try {
        const signer = crypto.createSign(scheme);
        // Signing
        signer.update(messagetobeSigned);

        // The signature output_format: HexBase64Latin1Encoding which can be either 'binary', 'hex' or 'base64'
        signer.sign({
            key: skObject,
            saltLength: 32,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING
        }, 'base64');
        signer.end();
    }
    catch (err) {
        return err;
    }

    return false;
}

export function rsakeygen(passphrase = 'idea-fast', modulusLength = 4096) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: modulusLength,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase: passphrase
        }
    });
    return { publicKey, privateKey };
}

export function eckeygen(curve = 'secp256k1') {
    const keyPair = crypto.generateKeyPairSync('ec', {
        namedCurve: curve,
        publicKeyEncoding: {
            type: 'spki',
            format: 'der'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'der'
        }
    });
    return keyPair;
}

export function tokengen(payload: string | Buffer | object, secret: string, passphrase = 'idea-fast', algorithm: Algorithm = 'RS256', life = 12000) {
    // Asymmetric JWT is used by default by setting algorithm = RS256.
    return jwt.sign(payload,
        { key: secret, passphrase: passphrase },
        { algorithm: algorithm, expiresIn: life }
    );
}

export function tokenverifier(token: string, secret: string) {
    return jwt.verify(token, secret);
}

function arrayBufferToBase64String(arrayBuffer: any) {
    const byteArray = new Uint8Array(arrayBuffer);
    let byteString = '';
    for (let i = 0; i < byteArray.byteLength; i++) {
        byteString += String.fromCharCode(byteArray[i]);
    }
    return btoa(byteString);
}

function convertBinaryToPem(binaryData: any, label: any) {
    const base64Cert = arrayBufferToBase64String(binaryData);
    let pemCert = '-----BEGIN ' + label + '-----\n';
    let nextIndex = 0;
    while (nextIndex < base64Cert.length) {
        if (nextIndex + 64 <= base64Cert.length) {
            pemCert += base64Cert.substr(nextIndex, 64) + '\n';
        } else {
            pemCert += base64Cert.substr(nextIndex) + '\n';
        }
        nextIndex += 64;
    }
    pemCert += '-----END ' + label + '-----\n';
    return pemCert;
}

function toSupportedArray(data: any) {

    // does this browser support Typed Arrays?
    const typedArraySupport = (typeof Uint8Array !== 'undefined');

    // get the data type of the parameter
    let dataType = Object.prototype.toString.call(data);
    dataType = dataType.substring(8, dataType.length - 1);
    const newArray = typedArraySupport ? new Uint8Array(data.length) : new Array(data.length);
    // determine the type
    switch (dataType) {

        // Regular JavaScript Array. Convert to Uint8Array if supported
        // else do nothing and return the array
        case 'Array':
            return typedArraySupport ? new Uint8Array(data) : data;

        // ArrayBuffer. IE11 Web Crypto API returns ArrayBuffers that you have to convert
        // to Typed Arrays. Convert to a Uint8Arrays and return;
        case 'ArrayBuffer':
            return new Uint8Array(data);

        // Already Uint8Array. Obviously there is support.
        case 'Uint8Array':
            return data;

        case 'Uint16Array':
        case 'Uint32Array':
            return new Uint8Array(data);

        // String. Convert the string to a byte array using Typed Arrays if supported.
        case 'String':
            for (let i = 0; i < data.length; i += 1) {
                newArray[i] = data.charCodeAt(i);
            }
            return newArray;

        // Some other type. Just return the data unchanged.
        default:
            throw new Error('toSupportedArray : unsupported data type ' + dataType);
    }

}

async function hash(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest({ name: 'SHA-256' }, data));
}

export async function createRSAKey(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey({
        name: 'RSA-PSS',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
    }, true, ['sign', 'verify']
    );
}

export async function exportRSAKey(keyPair: CryptoKeyPair) {
    const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    return { privateKey: convertBinaryToPem(privateKey, 'PRIVATE KEY'), publicKey: convertBinaryToPem(publicKey, 'PUBLIC KEY') };
    //return {privateKey: Utils.arrayBufferToBase64String(privateKey), publicKey: Utils.arrayBufferToBase64String(publicKey)};
}


export async function signwtRSAKey(message: string, privateKey: CryptoKey) {
    const messageEncoded = toSupportedArray(message);
    const finalEncoded = await hash(messageEncoded);
    const signature = await crypto.subtle.sign(
        {
            name: 'RSA-PSS',
            saltLength: 32
        },
        privateKey,
        finalEncoded
    );
    return arrayBufferToBase64String(signature);
}