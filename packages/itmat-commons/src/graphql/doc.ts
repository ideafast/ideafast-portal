import gql from 'graphql-tag';

export const GET_DOCS = gql`
    query getDocs(
        $docType: DOC_TYPE,  
    ) {
        getDocs (
            docType: $docType
        ) {
            id,
            title,
            data,
            docType,
            createdAt,
            lastModifiedAt,
            lastModifiedBy,
            status,
            attachments {
                fileName,
                fileBase64
            }
        }
    }
`;

export const CREATE_DOC = gql`
    mutation createDoc(
        $docType: DOC_TYPE, 
        $data: String
        $user: String
        $title: String
        $attachments: [AttachmentInput]
    ) {
        createDoc(
            docType: $docType, 
            data: $data,
            user: $user,
            title: $title,
            attachments: $attachments
        ) {
            id,
            title,
            docType,
            createdAt,
            lastModifiedAt,
            lastModifiedBy,
            status
        }
    }
`;

export const EDIT_DOC = gql`
    mutation editDoc(
        $id: String
        $data: String
        $user: String
        $title: String
        $status: DOC_STATUS
        $attachments: [AttachmentInput]
    ) {
        editDoc(
            id: $id,
            data: $data,
            user: $user,
            title: $title,
            status: $status,
            attachments: $attachments
        ) {
            id,
            title,
            docType,
            createdAt,
            lastModifiedAt,
            lastModifiedBy,
            status
        }
    }
`;
