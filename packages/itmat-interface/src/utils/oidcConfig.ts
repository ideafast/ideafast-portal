import { Account } from './oidcAccount';
import config from './configManager';
import sampleJwks from '../../config/jwks.sample.json';
import fs from 'fs-extra';

let jwks;
if (fs.existsSync('../../config/jwks.bak.json')) {
    jwks = fs.readFileSync('../../config/jwks.bak.json', 'utf8');
}
else {
    jwks = sampleJwks;
}

export const oidcConfiguration = {
    clients: [
        {
            client_id: config.oidc.client_id,
            client_secret: config.oidc.client_secret,
            grant_types: ['refresh_token', 'authorization_code'],
            redirect_uris: [config.oidc.redirect_url],
            token_endpoint_auth_method: 'client_secret_basic',
        },
    ],
    pkce: {
        methods: ['plain'],
        required: () => false,
    },
    interactions: {
        url(ctx, interaction) {
            return `/interaction/${interaction.uid}`;
        },
    },
    cookies: {
        long: { signed: true, maxAge: (1 * 24 * 60 * 60) * 1000 }, // 1 day in ms
        short: { signed: true },
        keys: ['mod_auth_openidc_session', 'mod_auth_openidc_session_chunks', 'mod_auth_openidc_session_0', 'mod_auth_openidc_session_1'],
    },
    claims: {
        email: ['email'],
    },
    features: {
        devInteractions: { enabled: false }, // defaults to true

        deviceFlow: { enabled: true }, // defaults to false
        introspection: { enabled: true }, // defaults to false
        revocation: { enabled: true }, // defaults to false
    },
    jwks,
    findAccount: Account.findAccount,
    ttl: {
        AccessToken: 1 * 60 * 60, // 1 hour in seconds
        AuthorizationCode: 10 * 60, // 10 minutes in seconds
        IdToken: 1 * 60 * 60, // 1 hour in seconds
        DeviceCode: 10 * 60, // 10 minutes in seconds
        RefreshToken: 1 * 24 * 60 * 60, // 1 day in seconds
    },
};

