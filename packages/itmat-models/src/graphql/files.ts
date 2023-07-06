import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

export const UPLOAD_FILE = gql`
    mutation uploadFile($studyId: String!, $file: Upload!, $description: String!, $fileLength: BigInt, $hash: String) {
        uploadFile(studyId: $studyId, file: $file, description: $description, fileLength: $fileLength, hash: $hash) {
            id
            uri
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
    }
`;

export const DELETE_FILE = gql`
    mutation deleteFile($fileId: String!) {
        deleteFile(fileId: $fileId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`;
