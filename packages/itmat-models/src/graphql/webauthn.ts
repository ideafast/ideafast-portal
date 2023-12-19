import gql from 'graphql-tag';
import { USER_FRAGMENT } from './user';


export const GET_WEBAUTHN = gql`
    query getWebauthn($webauthn_ids: [String]) {
        getWebauthn(webauthn_ids: $webauthn_ids) {
        username
        userId
        }
    }
`;


export const GET_DEVICES = gql`
  query getDevices{
    getWebauthnRegisteredDevices{
        id
        name
        credentialPublicKey
        credentialID
        counter
        transports
    }
  }
`;

export const DELETE_DEVICE = gql`
  mutation deleteDevices ($deviceId: String!){
    deleteWebauthnRegisteredDevices(deviceId: $deviceId){
        id
        name
        credentialPublicKey
        credentialID
        counter
        transports
    }
  }
`;

export const WEBAUTHN_REGISTER = gql`
  mutation webauthnRegister{
    webauthnRegister {
        rp {
            id
            name
        }
        user {
            id
            name
            displayName
        }
        challenge
        pubKeyCredParams {
            type
            alg
        }
        timeout
        excludeCredentials {
            id
            type
            transports
        }
        authenticatorSelection {
            requireResidentKey
            residentKey
        }
        attestation
        extensions {
            credProps
        }
    }
  }
`;


export const WEBAUTHN_REGISTER_VERIFY = gql`
    mutation webauthnRegisterVerify(
        $attestationResponse: RegistrationResponseJSON!
    ) {
        webauthnRegisterVerify(
            attestationResponse: $attestationResponse
        ){
        successful
        id
        }
  }
`;


export const WEBAUTHN_AUTHENTICATE = gql`
  mutation webauthnAuthenticate($userId: String!) {
    webauthnAuthenticate(userId: $userId) {
        challenge
        timeout
        rpId
        allowCredentials {
          id
          type
          transports
        }
        userVerification
    }
  }
`;

export const WEBAUTHN_AUTHENTICATE_VERIFY = gql`
    mutation webauthnAuthenticateVerify(
        $userId: String!, 
        $assertionResponse: AuthenticationResponseJSON!
    ) {
        webauthnAuthenticateVerify(
            userId: $userId, 
            assertionResponse: $assertionResponse
        ){
        successful
        }
  }
`;

export const WEBAUTHN_LOGIN = gql`
    mutation webauthnLogin(
        $userId: String!, 
    ) {
        webauthnLogin(
            userId: $userId, 
        ){
            ...ALL_FOR_USER
        }
  }
${USER_FRAGMENT}
`;
