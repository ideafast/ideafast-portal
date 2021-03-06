import crypto from 'crypto';
import jwt from 'jsonwebtoken';

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
    catch(err){
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
    catch(err){
        return err;
    }
}

export async function rsaverifier(pubkey: string, signature: string, message = '', scheme = 'RSA-SHA256') {
    try {
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
            //console.log('message to be verified: ', messageToBeVerified);
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
    catch(err){
        console.log(err);
        throw err;
    }
}

export async function rsaSigner_test(privateKey: string, signature: string, message = 'abc', scheme = 'RSA-SHA256') {
    try {
        const ec = new TextEncoder();

        const hash3 = crypto.createHash('sha256');
        hash3.update(ec.encode(message));
        const messagetobeSigned = hash3.digest('base64');
        console.log('Final encoded message to be signed: ', messagetobeSigned);

        const skObject = crypto.createPrivateKey({
            key: privateKey,
            type: 'pkcs8',
            format: 'pem'
        });

        let temp_signature;
        try {
            const signer = crypto.createSign(scheme);
            // Signing
            signer.update(messagetobeSigned);

            // The signature output_format: HexBase64Latin1Encoding which can be either 'binary', 'hex' or 'base64'
            temp_signature = signer.sign({
                key: skObject,
                saltLength: 32,
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING
            }, 'base64');
            signer.end();
        }
        catch(err){
            return err;
        }
        console.log('Signature generated at client-side: ', signature);
        console.log('Signature generated at server-side: ', temp_signature);

        return false;
    }
    catch(err){
        console.log(err);
        throw err;
    }
}

export function rsakeygen(passphrase = 'idea-fast', modulusLength = 4096) {
    const { publicKey, privateKey }  = crypto.generateKeyPairSync('rsa', {
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

export function tokengen(payload, secret, passphrase = 'idea-fast', algorithm = 'RS256', life = 12000) {
    // Asymmetric JWT is used by default by setting algorithm = RS256.
    return jwt.sign(payload,
        { key: secret, passphrase: passphrase },
        { algorithm: algorithm, expiresIn: life }
    );
}

export function tokenverifier(token, secret) {
    return jwt.verify(token, secret);
}
