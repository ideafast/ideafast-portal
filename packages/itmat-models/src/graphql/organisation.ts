import gql from 'graphql-tag';

export const GET_ORGANISATIONS = gql`
    query getOrganisations(
        $orgId: String
    ) {
        getOrganisations(
            orgId: $orgId
        ) {
            id
            name
            shortname
            profile
        }
    }
`;

// export const CREATE_ORGANISATION = gql`
//     mutation createOrganisation(
//         $name: String!,
//         $shortname: String
//     ) {
//         createOrganisation(
//             name: $name,
//             shortname: $shortname
//         ) {
//             id
//             name
//             shortname
//             profile
//         }
//     }
// `;

// export const DELETE_ORGANISATION = gql`
//     mutation deleteOrganisation(
//         $orgId: String!
//     ) {
//         deleteOrganisation(
//             orgId: $orgId
//         ) {
//             id
//             name
//             shortname
//             profile
//         }
//     }
// `;

// export const EDIT_ORGANISATION = gql`
//     mutation editOrganisation(
//         $orgId: String!,
//         $name: String!,
//         $shortname: String!,
//         $profile: String
//     ) {
//         editOrganisation(
//             orgId: $orgId,
//             name: $name,
//             shortname: $shortname,
//             profile: $profile
//         ) {
//             id
//             name
//             shortname
//             profile
//         }
//     }
// `;
