import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

export const GET_STUDIES = gql`
    query getStudies($studyId: String) {
        getStudies(studyId: $studyId) {
            id
            name
            currentDataVersion
            dataVersions {
                id
                tag
                version
            }
            description 
            groupList {
                id
                name
                type
                description
                parent
                children
            }
            profile
        }
    }
`;

export const CREATE_STUDY = gql`
    mutation createStudy($name: String!, $description: String, $profile: Upload) {
        createStudy(name: $name, description: $description, profile: $profile) {
            id
            name
            currentDataVersion
            dataVersions {
                id
                version
                tag
            }
            description
            profile
        }
    }
`;

export const EDIT_STUDY = gql`
    mutation editStudy($studyId: String!, $name: String, $description: String, $profile: Upload) {
        editStudy(studyId: $studyId, name: $name, description: $description, profile: $profile) {
            id
            name
            currentDataVersion
            dataVersions
            description
            groupList
        }
    }
`;

export const DELETE_STUDY = gql`
    mutation deleteStudy($studyId: String!) {
        deleteStudy(studyId: $studyId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const CREATE_STUDY_GROUP_NODE = gql`
    mutation createStudyGroupNode($studyId: String!, $groupNodeName: String!, $groupNodeType: EnumGroupNodeType!, $description: String, $parentGroupNodeId: String!) {
        createStudyGroupNode(studyId: $studyId, groupNodeName: $groupNodeName, groupNodeType: $groupNodeType, description: $description, parentGroupNodeId: $parentGroupNodeId) {
            id
            name
            type
            description
            parent
        }
    }
`

export const EDIT_STUDY_GROUP_NODE = gql`
    mutation editStudyGroupNode($studyId: String!, $groupNodeId: String!, $groupNodeName: String, $description: String, $parentGroupNodeId: String, $children: [String]) {
        editStudyGroupNode(
            studyId: $studyId,
            groupNodeId: $groupNodeId,
            groupNodeName: $groupNodeName,
            description: $description,
            parentGroupNodeId: $parentGroupNodeId,
            children: $children
        ) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`

export const GET_STUDY_GROUP_NODES = gql`
    query getStudyGroupNodes($studyId: String!) {
        getStudyGroupNodes(studyId: $studyId) {
            id
            name
            type
            description
            parent
            children
        }
    }
`

export const DELETE_STUDY_GROUP_NODE = gql`
    mutation deleteStudyGroupNode($studyId: String!, $groupNodeId: String!) {
        deleteStudyGroupNode(studyId: $studyId, groupNodeId: $groupNodeId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`

export const CREATE_DATA_VERSION = gql`
    mutation createDataVersion($studyId: String!, $dataVersion: String!, $tag: String){
        createNewDataVersion(studyId: $studyId, dataVersion: $dataVersion, tag: $tag) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const SET_DATAVERSION_AS_CURRENT = gql`
    mutation setDataversionAsCurrent($studyId: String!, $dataVersionId: String!) {
        setDataversionAsCurrent(studyId: $studyId, dataVersionId: $dataVersionId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;



export const CREATE_PROJECT = gql`
    mutation createProject($studyId: String!, $projectName: String!) {
        createProject(studyId: $studyId, projectName: $projectName) {
            id
            studyId
            name
        }
    }
`;

export const DELETE_PROJECT = gql`
    mutation deleteProject($projectId: String!) {
        deleteProject(projectId: $projectId) {
            id
            successful
        }
    }
`;

