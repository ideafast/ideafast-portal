import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

// export const GET_STUDY = gql`
//     query getStudy($studyId: String!) {
//         getStudy(studyId: $studyId) {
//             id
//             name
//             currentDataVersion
//             dataVersions
//             description
//             groupList
//         }
//     }
// `;

// export const CREATE_STUDY = gql`
//     mutation createStudy($name: String!, $description: String) {
//         createStudy(name: $name, description: $description) {
//             id
//             name
//             currentDataVersion
//             dataVersions
//             description
//             groupList
//         }
//     }
// `;

// export const EDIT_STUDY = gql`
//     mutation editStudy($studyId: String!, $name: Stirng, $description: String) {
//         editStudy(studyId: $studyId, name: $name, description: $description) {
//             id
//             name
//             currentDataVersion
//             dataVersions
//             description
//             groupList
//         }
//     }
// `;

// export const DELETE_STUDY = gql`
//     mutation deleteStudy($studyId: String!) {
//         deleteStudy(studyId: $studyId) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;

// export const CREATE_DATA_VERSION = gql`
//     mutation createDataVersion($studyId: String!, $dataVersion: String!, $tag: String){
//         createNewDataVersion(studyId: $studyId, dataVersion: $dataVersion, tag: $tag) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;

// export const SET_DATAVERSION_AS_CURRENT = gql`
//     mutation setDataversionAsCurrent($studyId: String!, $dataVersionId: String!) {
//         setDataversionAsCurrent(studyId: $studyId, dataVersionId: $dataVersionId) {
//             ...ALL_FOR_RESPONSE
//         }
//     }
//     ${GENERIC_RESPONSE}
// `;



// export const CREATE_PROJECT = gql`
//     mutation createProject($studyId: String!, $projectName: String!) {
//         createProject(studyId: $studyId, projectName: $projectName) {
//             id
//             studyId
//             name
//         }
//     }
// `;

// export const DELETE_PROJECT = gql`
//     mutation deleteProject($projectId: String!) {
//         deleteProject(projectId: $projectId) {
//             id
//             successful
//         }
//     }
// `;

