import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

export const USER_FRAGMENT = gql`
    fragment ALL_FOR_USER on User {
        id
        username
        firstname
        lastname
        email
        organisation
        type
        description
        emailNotificationsActivated
        profile
        expiredAt
        fileRepo {
            id
            value
            type
            parent
            children
            sharedUsers
        }
    }
`;

export const WHO_AM_I = gql`
    query {
        whoAmI {
            ...ALL_FOR_USER
        }
    }
    ${USER_FRAGMENT}
`;

export const GET_USERS = gql`
    query getUsers($userId: String) {
        getUsers (userId: $userId) {
            ...ALL_FOR_USER
        }
    }
    ${USER_FRAGMENT}
`;

export const RECOVER_SESSION_EXPIRE_TIME = gql`
    query recoverSessionExpireTime {
        recoverSessionExpireTime {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const LOGIN = gql`
    mutation login(
        $username: String!,
        $password: String!,
        $totp: String!,
        $requestexpirydate: Boolean
    ) {
        login(
            username: $username,
            password: $password,
            totp: $totp,
            requestexpirydate: $requestexpirydate
        ) {
            ...ALL_FOR_USER
        }
    }
    ${USER_FRAGMENT}
`;


export const LOGOUT = gql`
    mutation {
        logout{
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const REQUEST_USERNAME_OR_RESET_PASSWORD = gql`
    mutation requestUsernameOrResetPassword(
        $forgotUsername: Boolean!,
        $forgotPassword: Boolean!,
        $email: String,
        $username: String
    ) {
        requestUsernameOrResetPassword(
            forgotUsername: $forgotUsername,
            forgotPassword: $forgotPassword,
            email: $email,
            username: $username
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const RESET_PASSWORD = gql`
    mutation resetPassword(
        $encryptedEmail: String!,
        $token: String!,
        $newPassword: String!
    ) {
        resetPassword(
            encryptedEmail: $encryptedEmail,
            token: $token,
            newPassword: $newPassword
        ) {
            successful
        }
    }
`;


export const CREATE_USER = gql`
    mutation createUser(
        $username: String!,
        $firstname: String!,
        $lastname: String!,
        $email: String!,
        $password: String!,
        $description: String,
        $organisation: String!
    ){
        createUser(
            username: $username,
            firstname: $firstname,
            lastname: $lastname,
            email: $email,
            password: $password,
            description: $description,
            organisation: $organisation
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const REQUEST_EXPIRY_DATE = gql`
    mutation requestExpiryDate(
        $userId: String!
    ) {
        requestExpiryDate(
            userId: $userId
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const DELETE_USER = gql`
    mutation deleteUser(
        $userId: String!
    ) {
        deleteUser(
            userId: $userId
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const EDIT_USER = gql`
    mutation editUser(
        $userId: String!,
        $username: String,
        $type: USERTYPE,
        $firstname: String,
        $lastname: String,
        $email: String,
        $emailNotificationsActivated: Boolean,
        $password: String,
        $description: String,
        $organisation: String,
        $expiredAt: Int,
        $profile: String
    ) {
        editUser(
            userId: $userId,
            username: $username,
            type: $type,
            firstname: $firstname,
            lastname: $lastname,
            email: $email,
            emailNotificationsActivated: $emailNotificationsActivated,
            password: $password,
            description: $description,
            organisation: $organisation,
            expiredAt: $expiredAt,
            profile: $profile
        ) {
            id
            username
            type
            firstname
            lastname
            email
            emailNotificationsActivated
            description
            organisation
            expiredAt
            profile
        }
    }
`;

export const VALIDATE_RESET_PASSWORD = gql`
    query validateResetPassword(
        $encryptedEmail: String!,
        $token: String!
    ) {
        validateResetPassword(
            encryptedEmail: $encryptedEmail,
            token: $token
        ) {
            successful
        }
    }
`;

export const GET_FILE_REPO = gql`
    query getFileRepo(
        $userId: String!
    ) {
        getFileRepo(
            userId: $userId
        ) {
            id
            value
            type
            parent
            children
            sharedUsers
        }
    }
`;




