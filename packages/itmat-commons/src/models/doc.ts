export interface IDocWithoutData {
    id: string,
    title: string,
    docType: DOC_TYPE,
    createdAt: number,
    lastModifiedAt: number,
    lastModifiedBy: string,
    status: DOC_STATUS,
}

export interface IDoc extends IDocWithoutData  {
    data: string,
    attachments: attachment[]
}

export enum DOC_TYPE {
    DOCUMENTATION = 'DOCUMENTATION',
    NOTIFICATION = 'NOTIFICATION',
    OTHERS = 'OTHERS'
}

export enum DOC_STATUS {
    DELETED = 'DELETED',
    ACTIVATED = 'ACTIVATED',
    DEACTIVATED = 'DEACTIVATED'
}

export interface attachment {
    id: string,
    fileName: string,
    fileBase64: string
}
