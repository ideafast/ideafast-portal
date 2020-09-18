import { gql } from 'apollo-server-express';

export const schemaV0 = gql`
scalar JSON

enum USERTYPE {
    ADMIN
    STANDARD
    SYSTEM
}

enum FIELD_ITEM_TYPE {
    I  #image
    C  #clinical
}

enum FIELD_VALUE_TYPE {
    i # integer
    c # categorical
    d # decimal
    b # boolean
    t # free text

}

type Field {
    id: String!
    studyId: String!
    path: String!
    fieldId: Int!
    fieldName: String!
    valueType: FIELD_VALUE_TYPE!,
    possibleValues: [String],
    unit: String,
    itemType: FIELD_ITEM_TYPE!,
    numOfTimePoints: Int!,
    numOfMeasurements: Int!,
    notes: String
    fieldTreeId: String!
}

type UserAccess {
    id: String!
    projects: [Project]!
    studies: [Study]!
}

type UserPermissions {
    projects: [StudyOrProjectUserRole]!
    studies: [StudyOrProjectUserRole]!
}

type User {
    id: String!
    username: String! # admin only
    type: USERTYPE!
    firstname: String
    lastname: String
    organisation: String
    email: String # admin only
    description: String # admin only
    emailNotificationsActivated: Boolean!
    createdBy: String
    createdAt: Float!
    expiredAt: Float!
    # external to mongo documents:
    access: UserAccess # admin or self only
}

type OrganisationMetadata {
    siteIDMarker: String
}

type Organisation {
    id: String!
    name: String!
    shortname: String
    containOrg: String
    deleted: String
    metadata: OrganisationMetadata
}

type StudyOrProjectUserRole {
    id: String!
    name: String!
    studyId: String
    projectId: String
    permissions: [String]!
    users: [User]!
}

type File {
    id: String!
    fileName: String!
    studyId: String!
    projectId: String
    fileSize: Int
    description: String!
    uploadTime: String!
    uploadedBy: String!
}

type DataVersion {
    id: String!
    version: String!
    contentId: String!
    tag: String
    uploadDate: String!
    jobId: String!
    extractedFrom: String!
    fileSize: String!
    fieldTrees: [String]!
}

type Study {
    id: String!
    name: String!
    createdBy: String!
    lastModified: Int!
    currentDataVersion: Int
    dataVersions: [DataVersion]!

    # external to mongo documents:
    jobs: [Job]!
    projects: [Project]!
    roles: [StudyOrProjectUserRole]!
    # fields: [Field]!
    files: [File]!
    numOfSubjects: Int!
}

type ProjectFields {
    fieldTreeId: String!
    fieldsInFieldTree: [Field]!
}

type Project {
    id: String!
    studyId: String!
    name: String!

    #only admin
    patientMapping: JSON!
    approvedFields: JSON!
    approvedFiles: [String]!

    #external to mongo documents:
    jobs: [Job]!
    roles: [StudyOrProjectUserRole]!
    iCanEdit: Boolean
    fields: [ProjectFields]! # fields of the study current dataversion but filtered to be only those in Project.approvedFields
    files: [File]!
}

type Job {
    id: String!
    studyId: String!
    projectId: String
    jobType: String!
    requester: String!
    receivedFiles: [String]!
    requestTime: Float!
    status: String!
    error: [String]
    cancelled: Boolean
    cancelledTime: Int
    data: JSON
}

type QueryEntry {
    id: String!,
    queryString: String!,
    studyId: String!,
    projectId: String,
    requester: String!,
    status: String!,
    error: JSON,
    cancelled: Boolean,
    cancelledTime: Int,
    queryResult: String,
    data_requested: [String],
    cohort: JSON,
    new_fields: JSON
}

type GenericResponse {
    successful: Boolean!
    id: String
}

enum JOB_STATUS {
    finished
    error
    QUEUED
    PROCESSING
    CANCELLED
}

type JobStatusChange_Subscription {
    jobId: String!
    studyId: String!
    newStatus: JOB_STATUS!
    errors: [String]
}

input QueryObjInput {
    queryString: String!
    returnFieldSelection: [String]
    study: String!
    project: String
}

input CreateUserInput {
    username: String!
    type: USERTYPE
    firstname: String!
    lastname: String!
    email: String!
    description: String
    organisation: String!
    emailNotificationsActivated: Boolean
    password: String!
}

input EditUserInput {
    id: String!
    username: String
    type: USERTYPE
    firstname: String
    lastname: String
    email: String
    description: String
    organisation: String
    emailNotificationsActivated: Boolean
    password: String
    expiredAt: Float
}

input IntArrayChangesInput {
    add: [Int]!
    remove: [Int]!
}

input StringArrayChangesInput {
    add: [String]!
    remove: [String]!
}

type Query {
    # USER
    whoAmI: User
    getUsers(userId: String): [User]
    validateResetPassword(encryptedEmail: String!, token: String!): GenericResponse

    # ORGANISATION
    getOrganisations(organisationId: String): [Organisation]

    # STUDY
    getStudy(studyId: String!): Study
    getProject(projectId: String!): Project
    getStudyFields(fieldTreeId: String!, studyId: String!): [Field]

    # QUERY
    getQueries(studyId: String!, projectId: String): [QueryEntry]  # only returns the queries that the user has access to.
    getQueryById(queryId: String!): QueryEntry

    # PERMISSION
    getGrantedPermissions(studyId: String, projectId: String): UserPermissions

}

type Mutation {
    # USER
    login(username: String!, password: String!, totp: String!): User
    logout: GenericResponse
    requestUsernameOrResetPassword(
        forgotUsername: Boolean!,
        forgotPassword: Boolean!,
        email: String, # only provide email if forgotUsername
        username: String
    ): GenericResponse
    resetPassword(encryptedEmail: String!, token: String!, newPassword: String!): GenericResponse
    createUser(user: CreateUserInput!): GenericResponse

    # ORGANISATION
    createOrganisation(name: String!, containOrg: String): Organisation

    # APP USERS
    editUser(user: EditUserInput!): User
    deleteUser(userId: String!): GenericResponse

    # STUDY
    createStudy(name: String!): Study
    deleteStudy(studyId: String!): GenericResponse

    # PROJECT
    createProject(studyId: String!, projectName: String!, approvedFields: [String]): Project
    deleteProject(projectId: String!): GenericResponse
    editProjectApprovedFields(projectId: String!, fieldTreeId: String!, approvedFields: [String]!): Project
    editProjectApprovedFiles(projectId: String!, approvedFiles: [String]!): Project

    # ACCESS MANAGEMENT
    addRoleToStudyOrProject(studyId: String!, projectId: String, roleName: String!): StudyOrProjectUserRole
    editRole(roleId: String!, name: String, permissionChanges: StringArrayChangesInput, userChanges: StringArrayChangesInput): StudyOrProjectUserRole
    removeRole(roleId: String!): GenericResponse

    # FILES
    uploadFile(studyId: String!, description: String!, file: Upload!, fileLength: Int): File
    deleteFile(fileId: String!): GenericResponse

    # QUERY
    createQuery(query: QueryObjInput!): QueryEntry

    # CURATION
    createDataCurationJob(file: String!, studyId: String!, tag: String, version: String!): Job
    createFieldCurationJob(file: String!, studyId: String!, dataVersionId: String!, tag: String!): Job
    setDataversionAsCurrent(studyId: String!, dataVersionId: String!): Study

}

type Subscription {
    subscribeToJobStatusChange(studyId: String!): JobStatusChange_Subscription
}
`;
