import crypto from 'crypto';
import config from '../utils/configManager';

export function makeAESKeySalt(str: string): string {
    return str;
}

export function makeAESIv(str: string): string {
    if (str.length < 16) { throw new Error('IV cannot be less than 16 bytes long.'); }
    return str.slice(0, 16);
}

export async function encryptEmail(email: string, keySalt: string, iv: string): Promise<string> {
    const algorithm = 'aes-256-cbc';
    return new Promise((resolve, reject) => {
        crypto.scrypt(config.aesSecret, keySalt, 32, (err, derivedKey) => {
            if (err) reject(err);
            const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);
            let encoded = cipher.update(email, 'utf8', 'hex');
            encoded += cipher.final('hex');
            resolve(encoded);
        });
    });

}

export async function decryptEmail(encryptedEmail: string, keySalt: string, iv: string): Promise<string> {
    const algorithm = 'aes-256-cbc';
    return new Promise((resolve, reject) => {
        crypto.scrypt(config.aesSecret, keySalt, 32, (err, derivedKey) => {
            if (err) reject(err);
            try {
                const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
                let decoded = decipher.update(encryptedEmail, 'hex', 'utf8');
                decoded += decipher.final('utf-8');
                resolve(decoded);
            } catch (e) {
                reject(e);
            }
        });
    });
}
