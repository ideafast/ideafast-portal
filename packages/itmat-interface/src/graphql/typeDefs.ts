import gql from 'graphql-tag';

export const typeDefs = gql`
scalar JSON
scalar BigInt
scalar Upload

enum USERTYPE {
    ADMIN
    STANDARD
    SYSTEM
}

enum FIELD_ITEM_TYPE {
    I  #image
    C  #clinical
}



enum STUDYTYPE {
    SENSOR
    CLINICAL
    ANY
}


enum StandardizationRuleSource {
    value # from a given value
    data # from the value of the field
    fieldDef # from the definitions of the field
    reserved # from the related value entries
    inc # increase by 1
}

# rules for sources
# value: parameter is the value itself
# data: parameter is the key of the data, or paths joined by - for JSON data type;
#        note the input is a whole data reocrd including the subjectId & visitId
# fieldDef: parameter is the name of the attribute of the field definition, e.g., unit
# inc: no parameter needed

type Standardization {
    id: String!
    studyId: String!
    type: String!
    field: [String]!
    path: [String]
    joinByKeys: [String]
    stdRules: [StandardizationRule]
    dataVersion: String
    uploadedAt: Float
    metadata: JSON
    deleted: String
}

type StandardizationRule {
    id: String!
    entry: String!
    source: StandardizationRuleSource!
    parameter: [String]!
    joinByKeys: [String]
    filters: JSON
}

input StandardizationInput {
    type: String!
    field: [String]!
    path: [String]!
    joinByKeys: [String]
    stdRules: [StandardizationRuleInput]
}

input StandardizationRuleInput {
    entry: String!
    source: StandardizationRuleSource!
    parameter: [String]
    filters: JSON
}

enum EnumFieldDataType {
    INTEGER
    DECIMAL
    STRING
    BOOLEAN
    DATETIME
    FILE
    JSON
    CATEGORICAL
}


type CategoricalOption {
    id: String!
    code: String!
    description: String
    life: LifeCircle!
    metadata: JSON
}

input CategoricalOptionInput {
    code: String!
    description: String
}

type FieldValueVerifier {
    id: String!
    formula: AST
    condition: EnumConditionOp
    value: Float
    parameters: JSON
    life: LifeCircle
    metadata: JSON
}

enum EnumConditionOp {
    ADD
}

type AST {
    id: String!
    type: EnumASTNodeType
    op: EnumMathOp
    args: [AST]
}

input FieldValueVerifierInput {
    formula: ASTInput
    condition: EnumConditionOp
    value: Float
    parameters: JSON
}

input ASTInput {
    type: EnumASTNodeType
    op: EnumMathOp
    args: [ASTInput]
}

enum EnumASTNodeType {
    OPERATION
    VARIABLE
    VALUE
}

enum EnumMathOp {
    ADD
    MINUS
    MULTIPLY
    DIVIDE
    POW
}

type Field {
    id: String!
    studyId: String!
    fieldId: String!
    fieldName: String!
    tableName: String
    dataType: EnumFieldDataType!
    categoricalOptions: [CategoricalOption]
    unit: String
    comments: String
    dataVersion: String
    verifier: FieldValueVerifier
    life: LifeCircle
    metadata: JSON
}


input DataClipInput {
    fieldId: String!
    value: String
    subjectId: String!
    visitId: String
    timestamps: Int
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

enum EnumFileNodeType {
    FOLDER
    FILE
}

type FileNode {
    id: String!
    value: String!
    type: EnumFileNodeType!
    parent: String
    children: [String]
    sharedUsers: [String]
}

type LifeCircle {
    createdTime: Float!
    createdUser: String!
    deletedTime: Float
    deletedUser: String
}

type User {
    id: String!
    username: String!
    email: String!
    firstname: String!
    lastname: String!
    organisation: String!
    type: String!
    emailNotificationsActivated: Boolean
    password: String
    otpSecret: String
    profile: String
    description: String
    expiredAt: Float
    fileRepo: [FileNode]
    life: LifeCircle!
    metadata: JSON
}


type Pubkey {
    id: String!
    pubkey: String!
    associatedUserId: String
    jwtPubkey: String!
    jwtSeckey: String!
    refreshCounter: Int!
    deleted: String
}

type KeyPairwSignature {
    privateKey: String!
    publicKey: String!
    signature: String
}

type Signature {
    signature: String
}

type AccessToken {
    accessToken: String
}

type OrganisationMetadata {
    siteIDMarker: String
}

input OrganisationMetadataInput {
    siteIDMarker: String
}

type Organisation {
    id: String!
    name: String!
    shortname: String
    location: [Float]
    profile: String
}

type StudyOrProjectUserRole {
    id: String!
    name: String!
    studyId: String
    projectId: String
    description: String
    permissions: JSON
    users: [User]!
    metadata: JSON
}

type File {
    id: String!
    uri: String!
    fileName: String!
    studyId: String!
    projectId: String
    fileSize: String
    description: String!
    uploadTime: String!
    uploadedBy: String!
    hash: String!
    metadata: JSON
}

type DataVersion {
    id: String!
    version: String!
    contentId: String!
    tag: String
    life: LifeCircle!
    metadata: JSON
}

type OntologyTree {
    id: String!
    name: String!
    studyId: String!
    tag: String
    routes: [OntologyRoute]
    life: LifeCircle
    metadata: JSON
}

type OntologyRoute {
    id: String!
    path: [String]!
    name: String!
    fieldId: String!
    life: LifeCircle
    metadata: JSON
}

input OntologyTreeInput {
    name: String!
    routes: [OntologyRouteInput]
    metadata: JSON
}

input OntologyRouteInput {
    path: [String]!
    name: String!
    field: [String]!
}

enum EnumGroupNodeType {
    USER
    GROUP
}

type GroupNode {
    id: String!
    name: String!
    type: EnumFileNodeType!
    description: String
    parent: String
    childeren: [GroupNode]
}

type Study {
    id: String!
    name: String!
    currentDataVersion: Int
    dataVersions: [DataVersion]!
    description: String
    groupList: [GroupNode]
    life: LifeCircle!
    metadata: JSON
}

scalar ANY

type Data {
    id: String!
    studyId: String!
    subjectId: String!
    visitId: String!
    fieldId: String!
    dataVersion: String
    value: ANY
    timestamps: Int
    life: LifeCircle
    metadata: JSON
}

type Project {
    id: String!
    studyId: String!
    name: String!
    dataVersion: DataVersion
    summary: JSON

    #only admin
    patientMapping: JSON!
    
    #external to mongo documents:
    jobs: [Job]!
    roles: [StudyOrProjectUserRole]!
    iCanEdit: Boolean
    fields: [Field]!
    files: [File]!
    metadata: JSON
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

type Log {
    requesterId: String!
    userAgent: enumUserAgent
    type: enumEventType
    operationName: enumEventOperation
    parameters: JSON
    status: enumEventStatus
    errors: [String]
}

enum enumEventType {
   SYSTEM_LOG
   REQUEST_LOG
}

enum enumUserAgent {
    MOZILLA
    OTHER
}

enum enumEventStatus {
    SUCCESS
    FAIL
}


enum enumEventOperation {
    # SYSTEM
    START_SERVER
    STOP_SERVER

    # USER
    GET_USERS
    EDIT_USER
    DELETE_USER
    CREATE_USER
    LOGIN_USER
    WHO_AM_I
    LOGOUT
    REQUEST_USERNAME_OR_RESET_PASSWORD
    RESET_PASSWORD
    REQUEST_EXPIRY_DATE

    # KEY
    REGISTER_PUBKEY
    ISSUE_ACCESS_TOKEN
    KEYPAIRGEN_SIGNATURE
    RSA_SIGNER
    LINK_USER_PUBKEY

    # ORGANISATION
    GET_ORGANISATIONS
    CREATE_ORGANISATION
    DELETE_ORGANISATION

    # PROJECT
    GET_PROJECT
    # GET_PROJECT_PATIENT_MAPPING = 'GET_PROJECT_PATIENT_MAPPING',
    EDIT_PROJECT_APPROVED_FIELDS
    EDIT_PROJECT_APPROVED_FILES
    CREATE_PROJECT
    DELETE_PROJECT
    SET_DATAVERSION_AS_CURRENT
    SUBSCRIBE_TO_JOB_STATUS

    # STUDY | DATASET
    DELETE_STUDY
    GET_STUDY
    GET_STUDY_FIELDS
    CREATE_STUDY
    EDIT_STUDY
    CREATE_DATA_CURATION_JOB
    CREATE_FIELD_CURATION_JOB
    GET_DATA_RECORDS
    GET_ONTOLOGY_TREE
    CHECK_DATA_COMPLETE
    CREATE_NEW_DATA_VERSION
    UPLOAD_DATA_IN_ARRAY
    DELETE_DATA_RECORDS
    CREATE_NEW_FIELD
    EDIT_FIELD
    DELETE_FIELD
    ADD_ONTOLOGY_TREE
    DELETE_ONTOLOGY_TREE

    # STUDY & PROJECT
    EDIT_ROLE
    ADD_NEW_ROLE
    REMOVE_ROLE

    # FILE
    UPLOAD_FILE
    DOWNLOAD_FILE
    DELETE_FILE

    # QUERY
    GET_QUERY
    CREATE_QUERY
    GET_QUERY_BY_ID
    CREATE_QUERY_CURATION_JOB
}

type GenericResponse {
    id: String,
    successful: Boolean!
    code: String,
    description: String
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
    queryString: JSON!
    userId: String!
    studyId: String!
    projectId: String
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
    password: String!,
    metadata: JSON
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
    emailNotificationsStatus: JSON
    password: String
    expiredAt: Float
    metadata: JSON
}

input IntArrayChangesInput {
    add: [Int]!
    remove: [Int]!
}

input StringArrayChangesInput {
    add: [String]!
    remove: [String]!
}

type SubjectDataRecordSummary {
    subjectId: String!
    visitId: String!
    fieldId: String!
    error: String!
}

enum EnumConfigType {
    SYSTEMCONFIG
    STUDYCONFIG
    USERCONFIG
}

type Query {
    # USER
    whoAmI: User
    getUsers(userId: String): [User]
    validateResetPassword(encryptedEmail: String!, token: String!): GenericResponse
    recoverSessionExpireTime: GenericResponse
    getFileRepo(userId: String!): [FileNode]
    # ORGANISATION
    getOrganisations(orgId: String): [Organisation]

    # PUBLIC KEY AUTHENTICATION
    # getPubkeys(pubkeyId: String, associatedUserId: String): [Pubkey]

    # STUDY
    getStudy(studyId: String!): Study
    # getProject(projectId: String!): Project

    # DATA
    getFields(studyId: String!, projectId: String, versionId: String): [Field]
    getData(studyId: String!, projectId: String, versionId: String): [Data]
    getOntologyTree(studyId: String!, projectId: String, treeId: String): [OntologyTree]
    # getStandardization(studyId: String, projectId: String, type: String, versionId: String): [Standardization]
    # checkDataComplete(studyId: String!): [SubjectDataRecordSummary]
    
    # QUERY
    # getQueries(studyId: String, projectId: String): [QueryEntry]  # only returns the queries that the user has access to.
    # getQueryById(queryId: String!): QueryEntry

    # PERMISSION
    # getGrantedPermissions(studyId: String, projectId: String): UserPermissions

    # LOG
    getLogs(requesterId: [String], userAgent: [enumUserAgent], type: [enumEventType], operationName: [enumEventOperation], status: [enumEventStatus], startIndex: Int, endIndex: Int): [Log]

    # CONFIG
    getConfig(configType: EnumConfigType!, key: String): JSON

}

type Mutation {
    # USER

    login(username: String!, password: String!, totp: String!, requestexpirydate: Boolean): User
    logout: GenericResponse
    requestUsernameOrResetPassword(forgotUsername: Boolean!, forgotPassword: Boolean!, email: String, username: String): GenericResponse
    resetPassword(encryptedEmail: String!, token: String!, newPassword: String!): GenericResponse
    createUser(username: String!, firstname: String!, lastname: String!, email: String!, password: String!, description: String, organisation: String!): GenericResponse
    requestExpiryDate(username: String, email: String): GenericResponse
    editUser(userId: String!, username: String, type: USERTYPE, firstname: String, lastname: String, email: String, emailNotificationsActivated: Boolean, password: String, description: String, organisation: String, expiredAt: Int, profile: String): User
    deleteUser(userId: String!): GenericResponse

    # ORGANISATION
    createOrganisation(name: String!, shortname: String): Organisation
    editOrganisation(orgId: String!, name: String, shortname: String, profile: String): GenericResponse
    deleteOrganisation(id: String!): Organisation

    # PUBLIC KEY AUTHENTICATION
    # registerPubkey(pubkey: String!, signature: String!, associatedUserId: String): Pubkey    
    # issueAccessToken(pubkey: String!, signature: String!): AccessToken
    # keyPairGenwSignature: KeyPairwSignature
    # rsaSigner(privateKey: String!, message: String): Signature

    

    # APP USERS
    

    # STUDY
    createStudy(name: String!, description: String): Study
    deleteStudy(studyId: String!): GenericResponse
    editStudy(studyId: String!, name: String, description: String): Study
    createDataVersion(studyId: String!, dataVersion: String!, tag: String): GenericResponse
    setDataversionAsCurrent(studyId: String!, dataVersionId: String!): GenericResponse

    # DATA
    uploadData(studyId: String!, data: [DataClipInput]): [GenericResponse]
    deleteData(studyId: String!, subjectIds: [String], visitIds: [String], fieldIds: [String]): [GenericResponse]
    createField(studyId: String!, fieldName: String!, fieldId: String!, description: String, tableName: String, dataType: EnumFieldDataType, categoricalOptions: [CategoricalOptionInput], unit: String, comments: String, verifier: FieldValueVerifierInput): Field
    editField(studyId: String!, fieldName: String!, fieldId: String!, description: String, tableName: String, dataType: EnumFieldDataType, categoricalOptions: [CategoricalOptionInput], unit: String, comments: String, verifier: FieldValueVerifierInput): GenericResponse
    deleteField(studyId: String!, fieldId: String!): GenericResponse
    createOntologyTree(studyId: String!, name: String!, tag: String): OntologyTree
    deleteOntologyTree(studyId: String!, ontologyTreeId: String!): GenericResponse
    addOntologyRoutes(studyId: String!, ontologyTreeId: String!, routes: OntologyRouteInput): [GenericResponse]
    deleteOntologyRoutes(studyId: String!, ontologyTreeId: String!, routeIds: [String]): [GenericResponse]

    # STANDARDIZATION
    # deleteStandardization(studyId: String!, type: String, field: [String]!): GenericResponse

    # PROJECT
    # createProject(studyId: String!, projectName: String!): Project
    # deleteProject(projectId: String!): GenericResponse

    # ACCESS MANAGEMENT
    # addRole(studyId: String!, projectId: String, roleName: String!): StudyOrProjectUserRole
    # editRole(roleId: String!, name: String, description: String, permissionChanges: JSON, userChanges: StringArrayChangesInput): StudyOrProjectUserRole
    # removeRole(roleId: String!): GenericResponse

    # FILES
    # uploadFile(studyId: String!, description: String!, file: Upload!, fileLength: BigInt, hash: String): File
    # deleteFile(fileId: String!): GenericResponse

    # QUERY
    # createQuery(query: QueryObjInput!): QueryEntry

    # CURATION
    # createDataCurationJob(file: [String]!, studyId: String!): [Job]
    # createFieldCurationJob(file: String!, studyId: String!, tag: String!): Job
    # createQueryCurationJob(queryId: [String], studyId: String, projectId: String): Job
    # setDataversionAsCurrent(studyId: String!, dataVersionId: String!): Study

}

type Subscription {
    subscribeToJobStatusChange(studyId: String!): JobStatusChange_Subscription
}
`;
