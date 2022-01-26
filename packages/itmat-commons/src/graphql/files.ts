import { gql } from '@apollo/client';

export const UPLOAD_FILE = gql`
    mutation uploadFile($studyId: String!, $file: Upload!, $description: String!, $fileLength: BigInt, $hash: String) {
        uploadFile(studyId: $studyId, description: $description, file: $file, fileLength: $fileLength, hash: $hash) {
            id
            fileName
            studyId
            projectId
            fileSize
            description
            uploadedBy
            hash
        }
    }
`;

export const DELETE_FILE = gql`
    mutation deleteFile($fileId: String!) {
        deleteFile(fileId: $fileId) {
            successful
        }
    }
`;
