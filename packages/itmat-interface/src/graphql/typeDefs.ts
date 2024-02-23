import gql from 'graphql-tag';

export const typeDefs = gql`
scalar JSON
scalar BigInt
scalar Upload

enum FIELD_ITEM_TYPE {
    I  #image
    C  #clinical
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
    operator: EnumMathOp,
    value: String
    parameter: JSON
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

input DataClipInput {
    fieldId: String!
    value: String
    properties: JSON
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



enum EnumFileCategories {
    STUDY_DATA_FILE
    STUDY_PROFILE_FILE 
    USER_REPO_FILE
    USER_PROFILE_FILE
    DOC_FILE
    ORGANISATION_PROFILE_FILE
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

type StudyGroupNode {
    id: String!
    name: String!
    type: EnumGroupNodeType!
    description: String
    parent: String
    children: [String]
}

scalar ANY

type Data {
    id: String!
    studyId: String!
    fieldId: String!
    dataVersion: String
    value: ANY
    properties: JSON
    life: LifeCircle
    metadata: JSON
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

type Doc {
    id: String!
    title: String
    type: EnumDocType!
    description: String
    tag: String
    studyId: String
    contents: String
    priority: Int!
    attachmentFileIds: [String]
    life: LifeCircle!
    metadata: JSON
}

enum EnumDocType {
    HOMEPAGE
    GENERAL
    STUDYONLY
}



# start from now
type LifeCircle {
    createdTime: Float!
    createdUser: String!
    deletedTime: Float
    deletedUser: String
}


type ResetPasswordRequest {
    id: String!
    timeOfRequest: Int!
    used: Boolean!
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
    resetPasswordRequests: [ResetPasswordRequest]
    password: String
    otpSecret: String
    profile: String
    description: String
    expiredAt: Float
    life: LifeCircle
    metadata: JSON
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

enum USERTYPE {
    ADMIN
    STANDARD
    SYSTEM
}

type Organisation {
    id: String!
    name: String!
    shortname: String
    location: [Float]
    profile: String
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
    containOrg: String
    deleted: String
    metadata: OrganisationMetadata
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

enum STUDYTYPE {
    SENSOR
    CLINICAL
    ANY
}

type DataVersion {
    id: String!
    version: String!
    contentId: String!
    tag: String
    updateDate: String!
}

type OntologyTree {
    id: String!
    name: String!
    routes: [OntologyRoute]
    dataVersion: String!
    metadata: JSON
    deleted: Float
}

type Field {
    id: String!
    studyId: String!
    fieldId: String! # start
    fieldName: String!
    tableName: String
    dataType: FIELD_VALUE_TYPE!
    possibleValues: [ValueCategory]
    metadata: JSON
    unit: String
    comments: String
    dataVersion: String
    dateAdded: String!
    dateDeleted: String
}

type ValueCategory {
    id: String!
    code: String!
    description: String
}

enum FIELD_VALUE_TYPE {
    int # integer
    dec # decimal
    str # characters/string
    bool # boolean
    date # datetime, temporaily save as string
    file # file id
    json # JSON: array & object
    cat # CATEGORICAL
}

input DataClip {
    fieldId: String!
    value: String
    subjectId: String!
    visitId: String!
    file: Upload
    metadata: JSON
}

input ValueCategoryInput {
    code: String!
    description: String
}

input FieldInput {
    fieldId: String! # start
    fieldName: String!
    tableName: String
    dataType: FIELD_VALUE_TYPE!
    possibleValues: [ValueCategoryInput]
    unit: String
    comments: String
    metadata: JSON
}

type DataPermission {
    fields: [String]
    dataProperties: JSON
    includeUnVersioned: Boolean
    permission: Int
}

type DataVersion {
    id: String!
    version: String!
    contentId: String!
    tag: String
    life: LifeCircle!
    metadata: JSON
}

type File {
    id: String!
    uri: String!
    fileName: String!
    studyId: String!
    projectId: String
    fileSize: String
    description: String
    uploadTime: String!
    uploadedBy: String!
    hash: String!
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

type Study {
    id: String!
    name: String!
    createdBy: String!
    lastModified: Int!
    currentDataVersion: Int
    dataVersions: [DataVersion]!
    description: String
    type: STUDYTYPE
    ontologyTrees: [OntologyTree]
    # external to mongo documents:
    jobs: [Job]!
    projects: [Project]!
    roles: [StudyOrProjectUserRole]!
    # fields: [Field]!
    files: [File]!
    subjects: JSON!
    visits: JSON!
    numOfRecords: [Int]!
    metadata: JSON
}


## --->> webauthn type define start <<---

scalar PublicKeyCredentialType

#enum PublicKeyCredentialType {
#    public-key
#} 

enum UserVerificationRequirement {
    discouraged
    preferred
    required
}

type PublicKeyCredentialRpEntity {
    id: String
    name: String
}

type PublicKeyCredentialParameters {
    alg: Int
    type: String
}

# --> define type PublicKeyCredentialRequestOptions
type PublicKeyCredentialCreationOptions {
    rp: PublicKeyCredentialRpEntity
    user: PublicKeyCredentialUserEntityJSON
    challenge: String!
    pubKeyCredParams: [PublicKeyCredentialParameters]
    timeout: Int
    excludeCredentials: [PublicKeyCredentialDescriptorJSON]
    authenticatorSelection: AuthenticatorSelectionCriteria
    attestation: AttestationConveyancePreference
    extensions: AuthenticationExtensionsClientInputs
}

type PublicKeyCredentialRequestOptions {
    challenge: String
    timeout: Int
    rpId: String
    allowCredentials: [PublicKeyCredentialDescriptorJSON]
    userVerification: UserVerificationRequirement
    extensions: AuthenticationExtensionsClientInputs
}
  
type PublicKeyCredentialDescriptorJSON {
    id: String
    type: PublicKeyCredentialType
    transports: [AuthenticatorTransportFuture]
}

type PublicKeyCredentialUserEntityJSON {
    id: String
    name: String
    displayName: String
}
  
enum AuthenticatorTransportFuture {
    ble
    cable
    hybrid
    internal
    nfc
    smartCard
    usb
}
  
enum AttestationConveyancePreference {
    direct
    enterprise
    indirect
    none
}
  
type AuthenticatorSelectionCriteria {
    authenticatorAttachment: AuthenticatorAttachment
    requireResidentKey: Boolean
    residentKey: ResidentKeyRequirement
    userVerification: UserVerificationRequirement
}

# --> define input RegistrationResponseJSON

input RegistrationResponseJSON {
  id: String
  rawId: String
  response: AuthenticatorAttestationResponseJSON
  authenticatorAttachment: AuthenticatorAttachment
  clientExtensionResults: AuthenticationExtensionsClientOutputs
  type: PublicKeyCredentialType
}

input AuthenticatorAttestationResponseJSON {
  clientDataJSON: String
  attestationObject: String
  authenticatorData: String
  transports: [AuthenticatorTransportFuture]
  publicKeyAlgorithm: Int
  publicKey: String
}

input AuthenticationExtensionsClientOutputs {
  appid: Boolean
  credProps: CredentialPropertiesOutput
  hmacCreateSecret: Boolean
}

input CredentialPropertiesOutput {
  rk: Boolean
}

# <-- end of input RegistrationResponseJSON

# --> define the type PublicKeyCredentialRequestOptionsJSON

type PublicKeyCredentialRequestOptionsJSON {
    challenge: String!
    timeout: Int
    rpId: String
    allowCredentials: [PublicKeyCredentialDescriptorJSON]
    userVerification: UserVerificationRequirement
    extensions: AuthenticationExtensionsClientInputs
}

# <-- end of type PublicKeyCredentialRequestOptionsJSON


scalar AuthenticatorAttachment
  # enum AuthenticatorAttachment {
  #  cross-platform
  #  platform
  #}
  
enum ResidentKeyRequirement {
    discouraged
    preferred
    required
}
  
type AuthenticationExtensionsClientInputs {
    appid: String
    credProps: Boolean
    hmacCreateSecret: Boolean
}

# --> define the input AuthenticationResponseJSON
input AuthenticatorAssertionResponseJSON {
    clientDataJSON: String
    authenticatorData: String
    signature: String
    userHandle: String
}

input AuthenticationResponseJSON {
    id: String
    rawId: String
    response: AuthenticatorAssertionResponseJSON
    authenticatorAttachment: AuthenticatorAttachment
    clientExtensionResults: AuthenticationExtensionsClientOutputs
    type: PublicKeyCredentialType
}

type AuthenticatorDevice {
    id: String!
    name: String
    credentialPublicKey: String
    credentialID: String
    counter: Int
    transports: [String]

}

type IWebAuthn {
    id: String
    username: String
    userId: String
    devices: [AuthenticatorDevice]
    challenge: String
    challenge_timestamp: Int
}

## --->> webauthn type define end <<---


type Query {
    # USER
    whoAmI: User
    getUsers(userId: String): [User]
    validateResetPassword(encryptedEmail: String!, token: String!): GenericResponse
    recoverSessionExpireTime: GenericResponse
    
    # ORGANISATION
    getOrganisations(orgId: String): [Organisation]

    # PUBLIC KEY AUTHENTICATION
    getPubkeys(pubkeyId: String, associatedUserId: String): [Pubkey]

    # STUDY
    getStudy(studyId: String): [Study]
    
    # DATA
    getStudyFields(studyId: String!, projectId: String, versionId: String): [Field]
    getDataRecords(studyId: String!, queryString: JSON, versionId: String, projectId: String): JSON

    # WEBAUTHN
    getWebauthn(webauthn_ids: [String]): [IWebAuthn]
    getWebauthnRegisteredDevices: [AuthenticatorDevice]
    getWebauthnID: IWebAuthn
}

type Mutation {
    # USER
    login(username: String!, password: String!, totp: String!, requestexpirydate: Boolean): User
    logout: GenericResponse
    requestUsernameOrResetPassword(forgotUsername: Boolean!, forgotPassword: Boolean!, email: String, username: String): GenericResponse
    resetPassword(encryptedEmail: String!, token: String!, newPassword: String!): GenericResponse
    createUser(user: CreateUserInput!): GenericResponse
    requestExpiryDate(username: String, email: String): GenericResponse
    editUser(user: EditUserInput!): User
    deleteUser(userId: String!): GenericResponse

    # PUBLIC KEY AUTHENTICATION
    registerPubkey(pubkey: String!, signature: String!, associatedUserId: String): Pubkey    
    issueAccessToken(pubkey: String!, signature: String!): AccessToken
    keyPairGenwSignature: KeyPairwSignature
    rsaSigner(privateKey: String!, message: String): Signature    

    # STUDY
    createStudy(name: String!, description: String, type: STUDYTYPE!): Study
    deleteStudy(studyId: String!): GenericResponse
    editStudy(studyId: String!, description: String): Study
    createNewDataVersion(studyId: String!, dataVersion: String!, tag: String): DataVersion
    setDataversionAsCurrent(studyId: String!, dataVersionId: String!): Study


    # DATA
    uploadFile(studyId: String!, description: String!, file: Upload!, fileLength: BigInt, hash: String): File
    deleteFile(fileId: String!): GenericResponse
    uploadDataInArray(studyId: String!, data: [DataClip]): [GenericResponse]
    createNewField(studyId: String!, fieldInput: [FieldInput]!): [GenericResponse]
    editField(studyId: String!, fieldInput: FieldInput!): Field
    deleteField(studyId: String!, fieldId: String!): GenericResponse
    # createOntologyTree(studyId: String!, ontologyTree: OntologyTreeInput!): OntologyTree
    # deleteOntologyTree(studyId: String!, treeName: String!): GenericResponse


    # STANDARDIZATION
    # deleteStandardization(studyId: String!, type: String, field: [String]!): GenericResponse

    # ACCESS MANAGEMENT
    addRole(studyId: String!, projectId: String, roleName: String!): StudyOrProjectUserRole
    editRole(roleId: String!, name: String, description: String, permissionChanges: JSON, userChanges: StringArrayChangesInput): StudyOrProjectUserRole
    removeRole(roleId: String!): GenericResponse

    # WEBAUTHN
    webauthnRegister: PublicKeyCredentialCreationOptions
    webauthnRegisterVerify(attestationResponse: RegistrationResponseJSON!): GenericResponse
    webauthnAuthenticate(userId: String!): PublicKeyCredentialRequestOptionsJSON
    webauthnAuthenticateVerify(userId: String!, assertionResponse: AuthenticationResponseJSON!): GenericResponse
    webauthnLogin(userId: String!): User
    deleteWebauthnRegisteredDevices(deviceId: String!): [AuthenticatorDevice]
    updateWebauthnDeviceName(deviceId: String!, name: String!): [AuthenticatorDevice]

}

type Subscription {
    subscribeToJobStatusChange(studyId: String!): JobStatusChange_Subscription
}
`;
