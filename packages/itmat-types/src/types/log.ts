import { IBase } from './base';

export interface ILog extends IBase {
    requester: string;
    type: enumEventType;
    apiResolver: enumAPIResolver,
    event: string; // we do not use enum to avoid extra codes
    parameters: any;
    status: enumEventStatus;
    errors?: string;
    timeConsumed: number | null;
}

export enum enumAPIResolver {
    'tRPC' = 'tRPC',
    'GraphQL' = 'GraphQL'
}

export enum enumUserAgent {
    MOZILLA = 'MOZILLA',
    OTHER = 'OTHER'
}

export enum enumEventType {
    SYSTEM_LOG = 'SYSTEMLOG',
    API_LOG = 'APILOG'
}

export enum enumEventOperation {
    // SYSTEM
    startSERVER = 'START_SERVER',
    stopSERVER = 'STOP_SERVER',

    // USER
    getUsers = 'GET_USERS',
    EditUser = 'EDIT_USER',
    DeleteUser = 'DELETE_USER',
    CreateUser = 'CREATE_USER',
    login = 'LOGIN_USER',
    whoAmI = 'WHO_AM_I',
    logout = 'LOGOUT',
    requestUsernameOrResetPassword = 'REQUEST_USERNAME_OR_RESET_PASSWORD',
    resetPassword = 'RESET_PASSWORD',

    // KEY
    registerPubkey = 'REGISTER_PUBKEY',
    issueAccessToken = 'ISSUE_ACCESS_TOKEN',
    keyPairGenwSignature = 'KEYPAIRGEN_SIGNATURE',
    rsaSigner = 'RSA_SIGNER',
    linkUserPubkey = 'LINK_USER_PUBKEY',

    // ORGANISATION
    createOrganisation = 'CREATE_ORGANISATION',
    deleteOrganisation = 'DELETE_ORGANISATION',

    // PROJECT
    getProject = 'GET_PROJECT',
    // GET_PROJECT_PATIENT_MAPPING = 'GET_PROJECT_PATIENT_MAPPING',
    createProject = 'CREATE_PROJECT',
    deleteProject = 'DELETE_PROJECT',
    setDataversionAsCurrent = 'SET_DATAVERSION_AS_CURRENT',
    subscribeToJobStatusChange = 'SUBSCRIBE_TO_JOB_STATUS',

    // STUDY | DATASET
    deleteStudy = 'DELETE_STUDY',
    getStudy = 'GET_STUDY',
    getStudyFields = 'GET_STUDY_FIELDS',
    createStudy = 'CREATE_STUDY',
    editStudy = 'EDIT_STUDY',
    createFieldCurationJob = 'CREATE_FIELD_CREATION_JOB',
    createDataCurationJob = 'CREATE_DATA_CURATION_JOB',
    getDataRecords = 'GET_DATA_RECORDS',
    getOntologyTree = 'GET_ONTOLOGY_TREE',
    checkDataComplete = 'CHECK_DATA_COMPLETE',
    createNewDataVersion = 'CREATE_NEW_DATA_VERSION',
    uploadDataInArray = 'UPLOAD_DATA_IN_ARRAY',
    deleteDataRecords = 'DELETE_DATA_RECORDS',
    createNewField = 'CREATE_NEW_FIELD',
    editField = 'EDIT_FIELD',
    deleteField = 'DELETE_FIELD',
    addOntologyField = 'ADD_ONTOLOGY_FIELD',
    deleteOntologyField = 'DELETE_ONTOLOGY_FIELD',

    // STUDY & PROJECT
    editRole = 'EDIT_ROLE',
    addRole = 'ADD_NEW_ROLE',
    removeRole = 'REMOVE_ROLE',

    // FILE
    uploadFile = 'UPLOAD_FILE',
    DOWNLOAD_FILE = 'DOWNLOAD_FILE',
    deleteFile = 'DELETE_FILE',

    //QUERY
    getQueries = 'GET_QUERY',
    createQuery = 'CREATE_QUERY',
    getQueryById = 'GET_QUERY_BY_ID',
    createQueryCurationJob = 'CREATE_QUERY_CURATION_JOB',

    // WEBAUTHN
    webAuthnRegister = 'WEBAUTHN_REGISTER',
    webAuthnRegisterVerify = 'WEBAUTHN_REGISTER_VERIFY',
    webauthnAuthenticate = 'WEBAUTHN_AUTHENTICATE',
    webauthnAuthenticateVerify = 'WEBAUTHN_AUTHENTICATE_VERIFY',
    webauthnLogin = 'WEBAUTHN_LOGIN'


}

export enum enumEventStatus {
    SUCCESS = 'SUCCESS',
    FAIL = 'FAIL',
    UNKNOWN = 'UNKNOWN'
}
