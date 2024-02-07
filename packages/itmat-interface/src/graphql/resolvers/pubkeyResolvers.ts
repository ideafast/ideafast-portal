import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import { IUser, IPubkey, AccessToken, KeyPairwSignature, Signature, enumUserTypes } from '@itmat-broker/itmat-types';
//import { v4 as uuid } from 'uuid';
import { userCore } from '../../core/userCore';
import { errorCodes } from '../errors';
//import { makeGenericReponse, IGenericResponse } from '../responses';
import * as pubkeycrypto from '../../utils/pubkeycrypto';
export const pubkeyResolvers = {
    Query: {
        getPubkeys: async (__unused__parent: Record<string, unknown>, args: any): Promise<IPubkey[]> => {
            // a user is allowed to obtain his/her registered public key.
            let keys: any[] = (await userCore.getUserKeys(
                args.associatedUserId
            ));
            if (args.pubkeyId) {
                keys = keys.filter(el => el.id === args.pubkeyId);
            }
            keys.forEach(el => {
                delete el.jwtSeckey;
                el.deleted = el.life.deletedTime;
            });
            return keys;
        }
    },
    Mutation: {
        keyPairGenwSignature: async (): Promise<KeyPairwSignature> => {
            // Generate RSA key-pair with Signature for robot user
            const keyPair = pubkeycrypto.rsakeygen();
            //default message = hash of the public key (SHA256)
            const messageToBeSigned = pubkeycrypto.hashdigest(keyPair.publicKey);
            const signature = pubkeycrypto.rsasigner(keyPair.privateKey, messageToBeSigned);

            return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, signature: signature };
        },

        rsaSigner: async (__unused__parent: Record<string, unknown>, { privateKey, message }: { privateKey: string, message: string }): Promise<Signature> => {
            let messageToBeSigned;
            privateKey = privateKey.replace(/\\n/g, '\n');
            if (message === undefined) {
                //default message = hash of the public key (SHA256)
                try {
                    const reGenPubkey = pubkeycrypto.reGenPkfromSk(privateKey);
                    messageToBeSigned = pubkeycrypto.hashdigest(reGenPubkey);
                } catch (error) {
                    throw new GraphQLError('Error: private-key incorrect!', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT, error } });
                }

            } else {
                messageToBeSigned = message;
            }
            const signature = pubkeycrypto.rsasigner(privateKey, messageToBeSigned);
            return { signature: signature };
        },

        issueAccessToken: async (__unused__parent: Record<string, unknown>, { pubkey, signature }: { pubkey: string, signature: string }): Promise<AccessToken> => {
            return await userCore.issueAccessToken(pubkey, signature);
        },

        registerPubkey: async (__unused__parent: Record<string, unknown>, { pubkey, signature, associatedUserId }: { pubkey: string, signature: string, associatedUserId: string }, context: any): Promise<IPubkey> => {
            const requester: IUser = context.req?.user;
            if (requester.type !== enumUserTypes.ADMIN && requester.id !== associatedUserId) {
                throw new GraphQLError(errorCodes.NO_PERMISSION_ERROR);
            }
            return await userCore.registerPubkey(
                requester.id,
                pubkey,
                signature,
                associatedUserId
            );
        }
    }
};
