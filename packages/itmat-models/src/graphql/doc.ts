import gql from 'graphql-tag';
import { GENERIC_RESPONSE } from './utils';

export const GET_DOCS = gql`
    query getDocs($docId: String, $studyId: String, $docTypes: [EnumDocType], $verbose: Boolean) {
        getDocs(
            docId: $docId,
            studyId: $studyId,
            docTypes: $docTypes,
            verbose: $verbose
        ) {
            id
            title
            type
            description
            tag
            studyId
            contents
            priority
            attachmentFileIds
            life {
                createdTime
                createdUser
                deletedTime
                deletedUser
            }
            metadata
        }
    }
`

export const CREATE_DOC = gql`
    mutation createDoc($title: String!, $type: EnumDocType!, $description: String, $tag: String, $studyId: String, $priority: Int!, $attachments: [Upload!], $contents: String) {
        createDoc(
            title: $title,
            type: $type,
            description: $description,
            tag: $tag,
            studyId: $studyId,
            priority: $priority,
            attachments: $attachments,
            contents: $contents
        ) {
            id
            title
            type
            description
            tag
            studyId
            contents
            priority
            attachmentFileIds
            life {
                createdTime
                createdUser
                deletedTime
                deletedUser
            }
            metadata
        }
    }
`
export const EDIT_DOC = gql`
    mutation editDoc($docId: String!, $contents: String, $title: String, $tag: String, $description: String, $priority: Int, $addAttachments: [Upload], $removeAttachments: [String]) {
        editDoc (
            docId: $docId,
            contents: $contents,
            title: $title,
            tag: $tag,
            description: $description,
            priority: $priority,
            addAttachments: $addAttachments,
            removeAttachments: $removeAttachments
        ) {
            id
            title
            type
            description
            tag
            studyId
            contents
            priority
            attachmentFileIds
            life {
                createdTime
                createdUser
                deletedTime
                deletedUser
            }
            metadata
        }
    }
`

export const DELETE_DOC = gql `
    mutation deleteDoc($docId: String!) {
        deleteDoc(docId: $docId) {
            ...ALL_FOR_RESPONSE
        }
    }
    ${GENERIC_RESPONSE}
`