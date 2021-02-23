import gql from 'graphql-tag';

export const GET_DOCS = gql`
    query getDocs(
        $docType: DOC_TYPE,
        $docId: String,
        $withData: Boolean!
    ) {
        getDocs (
            docType: $docType
            docId: $docId
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
                id
                fileName,
                fileBase64 @include (if: $withData)
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
        $docType: DOC_TYPE
        $data: String
        $user: String
        $title: String
        $status: DOC_STATUS
        $attachments: [AttachmentInput]
    ) {
        editDoc(
            id: $id,
            docType: $docType,
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
