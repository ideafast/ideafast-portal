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
        categoricalOptions {
            id
            code
            description
        }
        metadata
        unit
        comments
        dataVersion
        verifier
        properties
        life {
            createdTime
            createdUser
            deletedTime
            deletedUser
        }
        metadata
    }
`;

export const GET_FIELDS = gql`
    query getFields($studyId: String!, $versionId: String) {
        getFields(studyId: $studyId, versionId: $versionId) {
            ...ALL_FOR_FIELD
        }
    }
    ${FIELD_FRAGMENT}
`;

export const GET_DATA = gql`
    query getData($studyId: String!, $versionId: String, $filters: JSON, $options: JSON) {
        getData(studyId: $studyId, versionId: $versionId, filters: $filters, options: $options) {
            id
            subjectId
            visitId
            fieldId
            value
            timestamps
            properties
            life {
                createdTime
                createdUser
            }
            metadata
        }
    }
`;

// export const GET_ONTOLOGY_TREE = gql`
//     query getOntologyTree($studyId: String!, $projectId: String, $treeId: String!) {
//         getOntologyTree(studyId: $studyId, projectId: $projectId, treeId: $treeId) {
//             id
//             studyId
//             name
//             tag
//             routes {
//                 id
//                 path
//                 name
//                 fieldId
//             }
//         }
//     }
// `;

export const UPLOAD_DATA = gql`
    mutation uploadData($studyId: String!, $data: [DataClipInput]) {
        uploadData(studyId: $studyId, data: $data) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

// export const DELETE_DATA = gql`
//     mutation deleteData($studyId: String!, $subjectIds: [String], $visitIds: [String], $fieldIds: [String]) {
//         deleteDataRecords(studyId: $studyId, subjectIds: $subjectIds, visitIds: $visitIds, fieldIds: $fieldIds) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;

export const CREATE_FIELD = gql`
    mutation createField($studyId: String!, $fieldName: String!, $fieldId: String!, $description: String, $tableName: String, $dataType: EnumFieldDataType, $categoricalOptions: [CategoricalOptionInput], $unit: String, $comments: String, $verifier: JSON, $properties: JSON) {
        createField(studyId: $studyId, fieldName: $fieldName, fieldId: $fieldId, description: $description, tableName: $tableName, dataType: $dataType, categoricalOptions: $categoricalOptions,unit: $unit, comments: $comments, verifier: $verifier, properties: $properties) {
            ...ALL_FOR_FIELD
        }
    }
    ${FIELD_FRAGMENT}
`;

export const EDIT_FIELD = gql`
    mutation editField($studyId: String!, $fieldName: String, $fieldId: String!, $description: String, $tableName: String, $dataType: EnumFieldDataType, $categoricalOptions: [CategoricalOptionInput], $unit: String, $comments: String, $verifier: JSON, $properties: JSON) {
        editField(studyId: $studyId, fieldName: $fieldName, fieldId: $fieldId, description: $description, tableName: $tableName, dataType: $dataType, categoricalOptions: $categoricalOptions,unit: $unit, comments: $comments, verifier: $verifier, properties: $properties) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const DELETE_FIELD = gql`
    mutation deleteField($studyId: String!, $fieldId: String!) {
        deleteField(studyId: $studyId, fieldId: $fieldId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

export const UPLOAD_FILE_DATA = gql`
    mutation uploadFileData($studyId: String!, $file: Upload!, $properties: JSON, $subjectId: String!, $fieldId: String!, $visitId: String, $timestamps: Int) {
        uploadFileData(studyId: $studyId, file: $file, properties: $properties, subjectId: $subjectId, fieldId: $fieldId, visitId: $visitId, timestamps: $timestamps) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;

// export const CREATE_ONTOLOGY_TREE = gql`
//     mutation createOntologyTree($studyId: String!, $name: String!, $tag: String) {
//         createOntologyTree(studyId: $studyId, name: $name, tag: $tag) {
//             id
//             name
//             studyId
//             tag
//             routes {
//                 id
//                 path
//                 name
//                 fieldId
//             }
//         }
//     }
// `;

// export const DELETE_ONTOLOGY_TREE = gql`
//     mutation deleteOntologyTree($studyId: String!, $ontologyTreeId: String!) {
//         deleteOntologyTree(studyId: $studyId, ontologyTreeId: $ontologyTreeId) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;

// export const ADD_ONTOLOGY_ROUTES = gql`
//     mutation addOntologyRoutes($studyId: String!, $ontologyTreeId: String!, $routes: OntologyRouteInput) {
//         addOntologyRoutes(studyId: $studyId, ontologyTreeId: $ontologyTreeId, routes: $routes) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;

// export const DELETE_ONTOLOGY_ROUTES = gql`
//     mutation deleteOntologyRoutes($studyId: String!, $ontologyTreeId: String!, $routeIds: [String]) {
//         addOntologyRoutes(studyId: $studyId, ontologyTreeId: $ontologyTreeId, routeIds: $routeIds) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;
