import gql from 'graphql-tag';

export const GENERIC_RESPONSE = gql`
    fragment ALL_FOR_RESPONSE on GenericResponse {
        id
        successful
        code
        description
    }
`;
