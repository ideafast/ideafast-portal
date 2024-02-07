import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

export const FIELD_FRAGMENT = gql`
    fragment ALL_FOR_FIELD on Field {
        id
        studyId
        fieldId
        fieldName
        tableName
        dataType
        dataVersion
        possibleValues {
            id
            code
            description
        }
        metadata
        unit
        comments
        dateAdded
        dateDeleted
    }
`;

export const GET_STUDY_FIELDS = gql`
    query getStudyFields($studyId: String!, $projectId: String, $versionId: String) {
        getStudyFields(studyId: $studyId, projectId: $projectId, versionId: $versionId) {
            ...ALL_FOR_FIELD
        }
    }
    ${FIELD_FRAGMENT}
`;

export const GET_DATA_RECORDS = gql`
    query getDataRecords($studyId: String!, $queryString: JSON, $versionId: String, $projectId: String) {
        getDataRecords(studyId: $studyId, queryString: $queryString, versionId: $versionId, projectId: $projectId)
    }
`;

export const UPLOAD_DATA_IN_ARRAY = gql`
    mutation uploadDataInArray($studyId: String!, $data: [DataClip]) {
        uploadDataInArray(studyId: $studyId, data: $data) {
            successful
            id
            code
            description
        }
    }
`;

export const CREATE_NEW_FIELD = gql`
    mutation createNewField($studyId: String!, $fieldInput: [FieldInput]!) {
        createNewField(studyId: $studyId, fieldInput: $fieldInput) {
            successful
            id
            code
            description
        }
    }
`;

export const EDIT_FIELD = gql`
    mutation editField($studyId: String!, $fieldInput: FieldInput!) {
        editField(studyId: $studyId, fieldInput: $fieldInput) {
            ...ALL_FOR_FIELD
        }
    }
    ${FIELD_FRAGMENT}
`;

export const DELETE_FIELD = gql`
    mutation deleteField($studyId: String!, $fieldId: String!) {
        deleteField(studyId: $studyId, fieldId: $fieldId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const DELETE_DATA_RECORDS = gql`
    mutation deleteDataRecords($studyId: String!, $subjectIds: [String], $visitIds: [String], $fieldIds: [String]) {
        deleteDataRecords(studyId: $studyId, subjectIds: $subjectIds, visitIds: $visitIds, fieldIds: $fieldIds) {
            successful
            id
            code
            description
        }
    }
`;
