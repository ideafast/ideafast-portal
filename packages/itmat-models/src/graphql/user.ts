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
            name
            fileId
            type
            parent
            children
            sharedUsers
        }
        sharedFileRepos
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
        $profile: Upload
    ){
        createUser(
            username: $username,
            firstname: $firstname,
            lastname: $lastname,
            email: $email,
            password: $password,
            description: $description,
            organisation: $organisation,
            profile: $profile
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

export const GET_USER_FILE_NODES = gql`
    query getUserFileNodes(
        $userId: String!
    ) {
        getUserFileNodes(
            userId: $userId
        ) {
            id
            name
            fileId
            type
            parent
            children
            sharedUsers
            life {
                createdTime
                createdUser
                deletedTime
                deletedUser
            }
        }
    }
`;

export const UPLOAD_USER_FILE_NODE = gql`
    mutation uploadUserFileNode(
        $userId: String!
        $parentNodeId: String!
        $file: Upload
        $folderName: String
    ) {
        uploadUserFileNode (
            userId: $userId,
            parentNodeId: $parentNodeId,
            file: $file,
            folderName: $folderName
        ) {
            id
            name
            fileId
            type
            parent
            children
            sharedUsers
        }
    }

`;

export const EDIT_USER_FILE_NODE = gql`
    mutation editUserFileNode(
        $userId: String!
        $nodeId: String!
        $parentNodeId: String
        $sharedUsers: [String]
    ) {
        editUserFileNode (
            userId: $userId,
            nodeId: $nodeId,
            parentNodeId: $parentNodeId,
            sharedUsers: $sharedUsers
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const SHARE_USER_FILE_NODE_BY_EMAIL = gql`
    mutation shareUserFileNodeByEmail(
        $userId: String!
        $nodeId: String!
        $sharedUserEmails: [String!]
    ) {
        shareUserFileNodeByEmail (
            userId: $userId,
            nodeId: $nodeId,
            sharedUserEmails: $sharedUserEmails
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const DELETE_USER_FILE_NODE = gql`
    mutation deleteUserFileNode(
        $userId: String!
        $nodeId: String!
    ) {
        deleteUserFileNode (
            userId: $userId,
            nodeId: $nodeId,
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const UPLOAD_USER_PROFILE = gql`
    mutation uploadUserProfile(
        $userId: String!,
        $description: String,
        $fileType: String!,
        $fileUpload: Upload!
    ) {
        uploadUserProfile (
            userId: $userId,
            description: $description,
            fileType: $fileType,
            fileUpload: $fileUpload
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const GET_USER_PROFILE = gql`
    query getUserProfile(
        $userId: String!
    ) {
        getUserProfile (
            userId: $userId
        )
    }
`;