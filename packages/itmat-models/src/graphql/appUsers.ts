import gql from 'graphql-tag';
import { USER_FRAGMENT } from './user';



// export const EDIT_USER = gql`
//     mutation EditUser(
//         $id: String!
//         $username: String
//         $type: USERTYPE
//         $firstname: String
//         $lastname: String
//         $email: String
//         $emailNotificationsActivated: Boolean
//         $emailNotificationsStatus: JSON
//         $password: String
//         $description: String
//         $organisation: String
//         $expiredAt: Float
//         $metadata: JSON
//     ) {
//         editUser(user: {
//             id: $id
//             username: $username
//             password: $password
//             firstname: $firstname
//             lastname: $lastname
//             emailNotificationsActivated: $emailNotificationsActivated
//             emailNotificationsStatus: $emailNotificationsStatus
//             email: $email
//             description: $description
//             organisation: $organisation
//             type: $type
//             expiredAt: $expiredAt
//             metadata: $metadata
//         }) {
//             ...ALL_FOR_USER
//         }
//     }
//     ${USER_FRAGMENT}
// `;

// export const DELETE_USER = gql`
//     mutation DeleteUser($userId: String!) {
//         deleteUser(userId: $userId) {
//             id
//             successful
//         }
//     }
// `;
