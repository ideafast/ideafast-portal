export enum userTypes {
    ADMIN = 'ADMIN',
    STANDARD = 'STANDARD',
    SYSTEM = 'SYSTEM'
}

export interface IUserWithoutToken {
    id: string;
    username: string;
    email: string;
    firstname: string;
    lastname: string;
    organisation: string;
    type: userTypes;
    description: string;
    emailNotificationsActivated: boolean;
    emailNotificationsStatus: { expiringNotification: boolean };
    deleted: number | null;
    createdAt: number;
    expiredAt: number;
    resetPasswordRequests: IResetPasswordRequest[];
    metadata?: Record<string, unknown>;
}

export interface IResetPasswordRequest {
    id: string;
    timeOfRequest: number;
    used: boolean;
}

export interface IUser extends IUserWithoutToken {
    password: string;
    otpSecret: string;
}
