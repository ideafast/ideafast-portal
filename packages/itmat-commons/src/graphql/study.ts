import gql from 'graphql-tag';
import { job_fragment } from './curation';

export const DELETE_STUDY = gql`
    mutation deleteStudy($studyId: String!) {
        deleteStudy(studyId: $studyId) {
            id
            successful
        }
    }
`;

export const GET_STUDY = gql`
    query getStudy($studyId: String!) {
        getStudy(studyId: $studyId) {
            id
            name
            createdBy
            description
            type
            ontologyTree {
                fieldId
                path
            }
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
    ${job_fragment}
`;

export const GET_DATA_RECORDS = gql`
    query getDataRecords($studyId: String!, $queryString: JSON, $versionId: [String], $projectId: String) {
        getDataRecords(studyId: $studyId, queryString: $queryString, versionId: $versionId, projectId: $projectId)
    }
`;

export const GET_ONTOLOGY_TREE = gql`
    query getOntologyTree($studyId: String!, $projectId: String) {
        getOntologyTree(studyId: $studyId, projectId: $projectId) {
            fieldId
            path
        }
    }
`;

export const CHECK_DATA_COMPLETE = gql`
    query checkDataComplete($studyId: String!) {
        checkDataComplete(studyId: $studyId) {
            subjectId
            visitId
            missingFields
        }
    }
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

export const CREATE_NEW_DATA_VERSION = gql`
    mutation createNewDataVersion($studyId: String!, $dataVersion: String!, $tag: String, $baseVersions: [String], $subjectIds: [String], $visitIds: [String], $withUnversionedData: Boolean!){
        createNewDataVersion(studyId: $studyId, dataVersion: $dataVersion, tag: $tag, baseVersions: $baseVersions, subjectIds: $subjectIds, visitIds: $visitIds, withUnversionedData: $withUnversionedData) {
            id
            version
            tag
            updateDate
            contentId
        }
    }
`;

export const UPLOAD_DATA_IN_ARRAY = gql`
    mutation uploadDataInArray($studyId: String!, $data: [DataClip]) {
        uploadDataInArray(studyId: $studyId, data: $data) {
            code
            description
        }
    }
`;

export const DELETE_DATA_RECORDS = gql`
    mutation deleteDataRecords($studyId: String!, $subjectId: String, $visitId: String, $fieldIds: [String]) {
        deleteDataRecords(studyId: $studyId, subjectId: $subjectId, visitId: $visitId, fieldIds: $fieldIds) {
            code
            description
        }
    }
`;

export const ADD_ONTOLOGY_FIELD = gql`
    mutation addOntologyField($studyId: String!, $ontologyInput: [OntologyFieldInput]!) {
        addOntologyField(studyId: $studyId, ontologyInput: $ontologyInput) {
            fieldId
            path
        }
    }
`;

export const DELETE_ONTOLOGY_FIELD = gql`
    mutation deleteOntologyField($studyId: String!, $fieldId: [String]!) {
        deleteOntologyField(studyId: $studyId, fieldId: $fieldId) {
            fieldId
            path
        }
    }
`;

export const CREATE_PROJECT = gql`
    mutation createProject($studyId: String!, $projectName: String!, $approvedFields: [String], $dataVersion: String!) {
        createProject(studyId: $studyId, projectName: $projectName, approvedFields: $approvedFields, dataVersion: $dataVersion) {
            id
            studyId
            dataVersion
            name
            approvedFields
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
