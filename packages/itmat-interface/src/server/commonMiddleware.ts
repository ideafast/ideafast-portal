import jwt from 'jsonwebtoken';
import { userRetrieval } from '@itmat-broker/itmat-cores';
import { db } from '../database/database';

export const tokenAuthentication = async (token: string) => {
    if (token !== '') {
        const decodedPayload = jwt.decode(token);

        if (decodedPayload !== null && typeof decodedPayload === 'object') {
            // Check if it's a system token
            if (decodedPayload['isSystemToken'] === true) {

                try {
                    jwt.verify(token, decodedPayload['publicKey']);
                    return await userRetrieval(db, decodedPayload['publicKey'], true, decodedPayload['userId']);
                } catch {
                    return false;
                }
            }

            // Handle regular user token
            const pubkey = decodedPayload['publicKey'];
            if (!pubkey) {
                return false;
            }

            try {
                jwt.verify(token, pubkey);
                return await userRetrieval(db, pubkey);
            } catch {
                return false;
            }
        }
        return false;
    }
    return null;
};