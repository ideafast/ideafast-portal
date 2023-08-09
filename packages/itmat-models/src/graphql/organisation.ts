import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

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
            location
            profile
        }
    }
`;

export const CREATE_ORGANISATION = gql`
    mutation createOrganisation(
        $name: String!,
        $shortname: String,
        $location: [Float]
    ) {
        createOrganisation(
            name: $name,
            shortname: $shortname
        ) {
            id
            name
            shortname
            location
            profile
        }
    }
`;

export const DELETE_ORGANISATION = gql`
    mutation deleteOrganisation(
        $orgId: String!
    ) {
        deleteOrganisation(
            orgId: $orgId
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const EDIT_ORGANISATION = gql`
    mutation editOrganisation(
        $orgId: String!,
        $name: String,
        $shortname: String,
        $location: [Float],
        $profile: String,
    ) {
        editOrganisation(
            orgId: $orgId,
            name: $name,
            shortname: $shortname,
            profile: $profile
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;
