import { ApolloError, UserInputError } from 'apollo-server-express';
import { mailer } from '../../emailer/emailer';
import {
    //Models,
    //Logger,
    IUser,
    //IUserWithoutToken,
    IPubkey,
    AccessToken
} from 'itmat-commons';
//import { v4 as uuid } from 'uuid';
import mongodb from 'mongodb';
import { db } from '../../database/database';
import config from '../../utils/configManager';
import { userCore } from '../core/userCore';
import { errorCodes } from '../errors';
//import { makeGenericReponse, IGenericResponse } from '../responses';
import * as pubkeycrypto from '../../utils/pubkeycrypto';

export const pubkeyResolvers = {
    Query: {
        getPubkeys: async (__unused__parent: Record<string, unknown>, args: any): Promise<IPubkey[]> => {
            // a user is allowed to obtain his/her registered public key.
            let queryObj;
            if (args.pubkeyId === undefined) {
                if (args.associatedUserId === undefined) {
                    queryObj = { deleted: null };
                } else {
                    queryObj = { deleted: null, associatedUserId: args.associatedUserId };
                }
            } else {
                queryObj = { deleted: null, id: args.pubkeyId };
            }

            const cursor = db.collections!.pubkeys_collection.find<IPubkey>(queryObj, { projection: { _id: 0 } });
            return cursor.toArray();
        }
    },

    Mutation: {
        issueAccessToken: async (__unused__parent: Record<string, unknown>, { pubkey, signature }: { pubkey: string, signature: string }): Promise<AccessToken> => {
            // refine the public-key parameter from browser
            pubkey = pubkey.replace(/\\n/g, '\n');

            /* Validate the signature with the public key */
            if (!pubkeycrypto.rsaverifier(pubkey, signature)) {
                throw new UserInputError('Signature vs Public key mismatched.');
            }

            const pubkeyrec = await db.collections!.pubkeys_collection.findOne({ pubkey, deleted: null });
            if (pubkeyrec === null || pubkeyrec === undefined) {
                throw new UserInputError('This public-key has not been registered yet!');
            }

            // payload of the JWT for storing user information
            const payload = {
                publicKey: pubkey,
                associatedUserId: pubkeyrec.associatedUserId,
                refreshCounter: pubkeyrec.refreshCounter,
                Issuer: 'IDEA-FAST DMP'
            };

            // update the counter
            const fieldsToUpdate = {
                refreshCounter: (pubkeyrec.refreshCounter + 1)
            };
            const updateResult: mongodb.FindAndModifyWriteOpResultObject<any> = await db.collections!.pubkeys_collection.findOneAndUpdate({ pubkey, deleted: null }, { $set: fieldsToUpdate }, { returnOriginal: false });
            if (updateResult.ok !== 1) {
                throw new ApolloError('Server error; cannot fulfil the JWT request.');
            }
            // return the acccess token
            const accessToken = {
                accessToken: pubkeycrypto.tokengen(payload, pubkeyrec.jwtSeckey)
            };
            return accessToken;
        },

        registerPubkey: async (__unused__parent: Record<string, unknown>, { pubkey, signature, associatedUserId }: { pubkey: string, signature: string, associatedUserId: string }, context: any): Promise<IPubkey> => {
            // refine the public-key parameter from browser
            pubkey = pubkey.replace(/\\n/g, '\n');

            const alreadyExist = await db.collections!.pubkeys_collection.findOne({ pubkey, deleted: null });
            if (alreadyExist !== null && alreadyExist !== undefined) {
                throw new UserInputError('This public-key has already been registered.');
            }

            const requester: IUser = context.req.user;
            /* Check whether requester is the same as the associated user*/
            if (associatedUserId && (requester.id !== associatedUserId)) {
                throw new ApolloError(errorCodes.NO_PERMISSION_ERROR);
            }

            /* Validate the signature with the public key */
            if (!pubkeycrypto.rsaverifier(pubkey, signature)) {
                throw new UserInputError('Signature vs Public key mismatched.');
            }

            /* Generate a public key-pair for generating and authenticating JWT access token later */
            const keypair = pubkeycrypto.rsakeygen();

            /* Update the new public key if the user is already associated with another public key*/
            if (associatedUserId) {
                const alreadyRegistered = await db.collections!.pubkeys_collection.findOne({ associatedUserId, deleted: null });
                if (alreadyRegistered !== null && alreadyRegistered !== undefined) {
                    //updating the new public key.
                    const fieldsToUpdate = {
                        pubkey,
                        jwtPubkey: keypair.publicKey,
                        jwtSeckey: keypair.privateKey
                    };
                    const updateResult: mongodb.FindAndModifyWriteOpResultObject<any> = await db.collections!.pubkeys_collection.findOneAndUpdate({ associatedUserId, deleted: null }, { $set: fieldsToUpdate }, { returnOriginal: false });
                    if (updateResult.ok === 1) {
                        await mailer.sendMail({
                            from: `${config.appName} <${config.nodemailer.auth.user}>`,
                            to: requester.email,
                            subject: `[${config.appName}] New public-key has sucessfully registered!`,
                            html: `
                                <p>
                                    Dear ${requester.firstname},
                                <p>
                                <p>
                                    Your new public-key "${pubkey}" on ${config.appName} has successfully registered !<br/>
                                    The old one is already wiped out!
                                    You will need to keep your new private key secretly. <br/>
                                    You will also need to sign a message (using this new public-key) to authenticate the owner of the public key. <br/>
                                </p>
                                
                                <br/>
                                <p>
                                    The ${config.appName} Team.
                                </p>
                            `
                        });

                        return updateResult.value;
                    } else {
                        throw new ApolloError('Server error; no entry or more than one entry has been updated.');
                    }
                }
            }

            /* Register new public key (either associated with an user or not) */
            const registeredPubkey = await userCore.registerPubkey({
                pubkey,
                jwtPubkey: keypair.publicKey,
                jwtSeckey: keypair.privateKey,
                associatedUserId: associatedUserId ?? null
            });

            await mailer.sendMail({
                from: `${config.appName} <${config.nodemailer.auth.user}>`,
                to: requester.email,
                subject: `[${config.appName}] Public-key Registration!`,
                html: `
                    <p>
                        Dear ${requester.firstname},
                    <p>
                    <p>
                        You have successfully registered your public-key "${pubkey}" on ${config.appName}!<br/>
                        You will need to keep your private key secretly. <br/>
                        You will also need to sign a message (using your public-key) to authenticate the owner of the public key. <br/>
                    </p>
                    
                    <br/>
                    <p>
                        The ${config.appName} Team.
                    </p>
                `
            });

            return registeredPubkey;
        }
    },

    Subscription: {}
};
