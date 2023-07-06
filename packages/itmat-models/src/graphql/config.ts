import gql from 'graphql-tag';

export const GET_CONFIG = gql`
    query getConfig($configType: EnumConfigType!, $key: String) {
        getConfig(configType: $configType, key: $key)
    }
`;
