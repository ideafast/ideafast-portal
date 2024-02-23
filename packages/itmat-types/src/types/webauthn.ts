
/*
* Each authenticator must also be associated to a user so that you can generate a list of
* authenticator credential IDs to pass into `generateAuthenticationOptions()`, from which one is
* expected to generate an authentication response.
*/

import type { AuthenticatorTransportFuture } from '@simplewebauthn/typescript-types';
import { IUser } from './user';

// overwrite the AuthenticatorDevice type in simplewebauthn
export type AuthenticatorDevice = {
    id: string;
    name?: string;
    credentialPublicKey: Uint8Array;
    credentialID: Uint8Array;
    counter: number;
    transports?: AuthenticatorTransportFuture[];

};

// include the credential
export interface IWebAuthn{
    id: string;
    userId: IUser['id'];
    username: IUser['username'];
    devices: AuthenticatorDevice[];
    challenge: Uint8Array;
    challengeTimestamp: number;
}
