import gql from 'graphql-tag';

export const GET_ORGANISATIONS = gql`
    query getOrganisations($organisationId: String) {
        getOrganisations(organisationId: $organisationId) {
            id
            name
            shortname
            life {
                createdTime
                createdUser
                deletedTime
                deletedUser
            }
        }
    }
`;

