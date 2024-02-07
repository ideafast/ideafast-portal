import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

export const USER_FRAGMENT = gql`
    fragment ALL_FOR_USER on User {
        id
        username
        email
        firstname
        lastname
        organisation
        type
        emailNotificationsActivated
        resetPasswordRequests {
            id
            timeOfRequest
            used
        }
        password
        otpSecret
        profile
        description
        expiredAt
        life {
            createdTime
            createdUser
            deletedTime
            deletedUser
        }
        metadata
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
    mutation CreateUser(
        $username: String!
        $password: String!
        $firstname: String!
        $lastname: String!
        $description: String
        $organisation: String!
        $emailNotificationsActivated: Boolean
        $email: String!
        $type: USERTYPE
        $metadata: JSON
    ){
        createUser(user: {
            username: $username
            password: $password            
            firstname: $firstname
            lastname: $lastname
            description: $description
            organisation: $organisation
            emailNotificationsActivated: $emailNotificationsActivated
            email: $email
            type: $type
            metadata: $metadata
        }) {
            successful
        }
    }
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

export const EDIT_USER = gql`
    mutation EditUser(
        $id: String!
        $username: String
        $type: USERTYPE
        $firstname: String
        $lastname: String
        $email: String
        $description: String
        $organisation: String
        $emailNotificationsActivated: Boolean
        $emailNotificationsStatus: JSON
        $password: String
        $expiredAt: Float
        $metadata: JSON
    ) {
        editUser(user: {
            id: $id
            username: $username
            type: $type
            firstname: $firstname
            lastname: $lastname
            email: $email
            description: $description
            organisation: $organisation
            emailNotificationsActivated: $emailNotificationsActivated
            emailNotificationsStatus: $emailNotificationsStatus
            password: $password
            expiredAt: $expiredAt
            metadata: $metadata
        }) {
            ...ALL_FOR_USER
        }
    }
    ${USER_FRAGMENT}
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
