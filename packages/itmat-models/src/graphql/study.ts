import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';
import { JOB_FRAGMENT } from './curation';

export const GET_STUDY = gql`
    query getStudy($studyId: String!) {
        getStudy(studyId: $studyId) {
            id
            name
            createdBy
            description
            type
            jobs {
                ...ALL_FOR_JOB
            }
            projects {
                id
                studyId
                name
            }
            roles {
                id
                name
                permissions
                projectId
                studyId
                description
                users {
                    id
                    firstname
                    lastname
                    organisation
                    username
                }
            }
            files {
                id
                fileName
                studyId
                projectId
                fileSize
                description
                uploadTime
                uploadedBy
                hash
                metadata
            }
            subjects
            visits
            numOfRecords
            currentDataVersion
            dataVersions {
                id
                version
                tag
                updateDate
                contentId
            }
        }
    }
    ${JOB_FRAGMENT}
`;

export const CREATE_STUDY = gql`
    mutation createStudy($name: String!, $description: String, $type: STUDYTYPE!){
        createStudy(name: $name, description: $description, type: $type) {
            id
            name
            description
            type
        }
    }
`;

export const EDIT_STUDY = gql`
    mutation editStudy($studyId: String!, $description: String) {
        editStudy(studyId: $studyId, description: $description) {
            id
            name
            description
            type
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

export const CREATE_NEW_DATA_VERSION = gql`
    mutation createNewDataVersion($studyId: String!, $dataVersion: String!, $tag: String){
        createNewDataVersion(studyId: $studyId, dataVersion: $dataVersion, tag: $tag) {
            id
            version
            tag
            updateDate
            contentId
        }
    }
`;

export const SET_DATAVERSION_AS_CURRENT = gql`
    mutation setDataversionAsCurrent($studyId: String!, $dataVersionId: String!) {
        setDataversionAsCurrent(studyId: $studyId, dataVersionId: $dataVersionId) {
            id
            currentDataVersion
            dataVersions {
                id
                version
                tag
                updateDate
                contentId
            }
        }
    }
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

