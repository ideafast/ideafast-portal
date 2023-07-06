import { ApolloServerErrorCode } from '@apollo/server/errors';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import { mailer } from '../../emailer/emailer';
import { IUser, IGenericResponse, IResetPasswordRequest, enumUserTypes, IOrganisation, IFileNode } from '@itmat-broker/itmat-types';
import { Logger } from '@itmat-broker/itmat-commons';
import { v4 as uuid } from 'uuid';
import config from '../../utils/configManager';
import { userCore } from '../core/userCore';
import { errorCodes } from '../errors';
import { makeGenericReponse } from '../responses';
import QRCode from 'qrcode';
import tmp from 'tmp';
import { decryptEmail, encryptEmail, makeAESIv, makeAESKeySalt } from '../../encryption/aes';
import * as mfa from '../../utils/mfa';

export const userResolvers = {
    Query: {
        whoAmI(__unused__parent: Record<string, unknown>, __unused__args: any, context: any): Record<string, unknown> {
            /**
             * Return the object of IUser of the current requester.
             *
             * @return Record<string, unknown> - The object of IUser.
             */
            return context.req.user;
        },

        getUsers: async (__unused__parent: Record<string, unknown>, { userId }: { userId: string | null }, context: any): Promise<Partial<IUser>[]> => {
            /**
             * Get the list of users.
             *
             * @param userId - The id of the user. If null, return all users.
             * @return Partial<IUser>[] - The list of objects of IUser.
             */

            const requester: IUser = context.req.user;

            const users = userId ? await userCore.getUser(userId, null, null) : await userCore.getAllUsers(false);
            /* If user is admin, or user is asking info of own, then return all info. Otherwise, need to remove private info. */
            const priority = requester.type === enumUserTypes.ADMIN || requester.id === userId;
            const clearedUsers: Partial<IUser>[] = [];
            if (!(requester.type === enumUserTypes.ADMIN) || !(requester.id === userId)) {
                for (const user of users) {
                    const cleared: Partial<IUser> = {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        firstname: user.firstname,
                        lastname: user.lastname,
                        organisation: user.organisation,
                        type: user.type,
                        profile: user.profile,
                        description: user.description
                    };
                    if (priority) {
                        cleared.emailNotificationsActivated = user.emailNotificationsActivated;
                        cleared.expiredAt = user.expiredAt;
                        cleared.fileRepo = user.fileRepo;
                    }
                    clearedUsers.push(cleared);
                }
            }
            return users as Partial<IUser>[];
        },

        recoverSessionExpireTime: async (): Promise<IGenericResponse> => {
            /**
             * Refresh the existing session to avoid timeout. Express will update the session as long as there is a new query in.
             *
             * @return IGenericResponse - The obejct of IGenericResponse.
             */
            return makeGenericReponse();
        },

        getFileRepo: async (__unused__parent: Record<string, unknown>, { userId }: { userId: string }, context: any): Promise<IFileNode[]> => {
            /**
             * Get the list of file nodes of a user.
             *
             * @param userId - The id of the user.
             *
             * @return IFileNode[]
             */

            const requester: IUser = context.req.user;

            if (!(requester.type === enumUserTypes.ADMIN) || !(requester.id === userId)) {
                throw new GraphQLError('', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }

            return await userCore.getFileNodes(userId);

        }
    },
    Mutation: {
        requestExpiryDate: async (__unused__parent: Record<string, unknown>, { userId }: { userId: string }): Promise<IGenericResponse> => {
            /**
             * Ask for a request to extend account expiration time. Send notifications to user and admin.
             *
             * @param userId - The id of the user.
             *
             * @return IGenericResponse - The object of IGenericResponse
             */

            const user = (await userCore.getUser(userId, null, null))[0];
            if (!user || !user.email || !user.username) {
                /* even user is null. send successful response: they should know that a user doesn't exist */
                await new Promise(resolve => setTimeout(resolve, Math.random() * 6000));
                return makeGenericReponse(userId, false, undefined, 'User information is not correct.');
            }
            /* send email to the DMP admin mailing-list */
            await mailer.sendMail(formatEmailRequestExpiryDatetoAdmin({
                userEmail: user.email,
                username: user.username
            }));

            /* send email to client */
            await mailer.sendMail(formatEmailRequestExpiryDatetoClient({
                to: user.email,
                username: user.username
            }));

            return makeGenericReponse(userId, true, undefined, 'Request successfully sent.');
        },
        requestUsernameOrResetPassword: async (__unused__parent: Record<string, unknown>, { forgotUsername, forgotPassword, email, username }: { forgotUsername: boolean, forgotPassword: boolean, email: string | null, username: string | null }, context: any): Promise<IGenericResponse> => {
            /**
             * Request for resetting password.
             *
             * @param forgotUsername - Whether user forget the username.
             * @param forgotPassword - Whether user forgot the password.
             * @param email - The email of the user. If using email to reset password.
             * @param username - The username of the uer. If using username to reset password.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */

            /* checking the args are right */
            if ((forgotUsername && !email) // should provide email if no username
                || (forgotUsername && username) // should not provide username if it's forgotten.
                || (!email && !username)) {
                throw new GraphQLError('Inputs are invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            } else if (email && username) {
                // TO_DO : better client erro
                /* only provide email if no username */
                throw new GraphQLError('Inputs are invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check user existence */
            const user = (await userCore.getUser(null, username, email))[0];
            if (!user) {
                /* even user is null. send successful response: they should know that a user doesn't exist */
                await new Promise(resolve => setTimeout(resolve, Math.random() * 6000));
                return makeGenericReponse(undefined, false, undefined, 'User does not exist.');
            }

            if (forgotPassword) {
                /* make link to change password */
                const passwordResetToken = uuid();
                const resetPasswordRequest: IResetPasswordRequest = {
                    id: passwordResetToken,
                    timeOfRequest: new Date().valueOf(),
                    used: false
                };
                await userCore.addResetPasswordRequest(user.id ?? '', resetPasswordRequest);

                /* send email to client */
                await mailer.sendMail(await formatEmailForForgottenPassword({
                    to: user.email ?? '',
                    resetPasswordToken: passwordResetToken,
                    username: user.username ?? '',
                    firstname: user.firstname ?? '',
                    origin: context.req.headers.origin
                }));
            } else {
                /* send email to client */
                await mailer.sendMail(formatEmailForFogettenUsername({
                    to: user.email ?? '',
                    username: user.username ?? ''
                }));
            }
            return makeGenericReponse(user.id, true, undefined, 'Request of resetting password successfully sent.');
        },
        login: async (parent: Record<string, unknown>, { username, password, totp, requestexpirydate }: { username: string, password: string, totp: string, requestexpirydate: boolean }, context: any): Promise<Partial<IUser>> => {
            /**
             * Log in to the system.
             *
             * @param username - The username of the user.
             * @param password - The password of the user.
             * @param totp - The totp of the user.
             * @param requestexpirydate - Whether to request for extend the expiration time of the user.
             *
             * @return Partial<IUser> - The object of Partial<IUser>
             */

            const { req }: { req: Express.Request } = context;
            const user = (await userCore.getUser(null, username, null))[0];

            if (!user || !user.password || !user.otpSecret || !user.expiredAt || !user.email || !user.username) {
                throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            const passwordMatched = await bcrypt.compare(password, user.password);
            if (!passwordMatched) {
                throw new GraphQLError('Incorrect password.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* validate the TOTP */
            const totpValidated = mfa.verifyTOTP(totp, user.otpSecret);
            if (!totpValidated) {
                if (process.env.NODE_ENV === 'development')
                    console.warn('Incorrect One-Time password. Continuing in development ...');
                else
                    throw new GraphQLError('Incorrect One-Time password.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* validate if account expired */
            if (user.expiredAt < Date.now() && user.type === enumUserTypes.STANDARD) {
                if (requestexpirydate) {
                    /* send email to the DMP admin mailing-list */
                    await mailer.sendMail(formatEmailRequestExpiryDatetoAdmin({
                        userEmail: user.email,
                        username: user.username
                    }));
                    /* send email to client */
                    await mailer.sendMail(formatEmailRequestExpiryDatetoClient({
                        to: user.email,
                        username: user.username
                    }));
                    throw new GraphQLError('New expiry date has been requested! Wait for ADMIN to approve.', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
                }

                throw new GraphQLError('Account Expired. Please request a new expiry date!', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
            }

            const filteredUser: Partial<IUser> = { ...user };
            delete filteredUser.password;
            delete filteredUser.otpSecret;
            delete filteredUser.fileRepo;

            return new Promise((resolve) => {
                req.login(filteredUser, (err: any) => {
                    if (err) {
                        Logger.error(err);
                        throw new GraphQLError('Cannot log in. Please try again later.');
                    }
                    resolve(filteredUser);
                });
            });
        },
        logout: async (parent: Record<string, unknown>, __unused__args: any, context: any): Promise<IGenericResponse> => {
            /**
             * Logout an account.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */

            const requester: IUser = context.req.user;
            const req: Express.Request = context.req;
            if (!requester) {
                return makeGenericReponse(undefined, false, undefined, 'Requester not known.');
            }
            return new Promise((resolve) => {
                req.logout((err) => {
                    if (err) {
                        Logger.error(err);
                        throw new GraphQLError('Cannot log out');
                    } else {
                        resolve(makeGenericReponse(context.req.user));
                    }
                });
            });
        },
        createUser: async (__unused__parent: Record<string, unknown>, { username, firstname, lastname, email, password, description, organisation }: {
            username: string, firstname: string, lastname: string, email: string, password: string, description: string | null, organisation: string
        }, context: any): Promise<Partial<IUser>> => {
            /**
             * Create a user.
             *
             * @param username - The username of the user.
             * @param firstname - The firstname of the user.
             * @param lastname - The lastname of the user.
             * @param email - The email of the user.
             * @param password - The password of the user.
             * @param description - The description of the user.
             */

            /* check email is valid form */
            if (!/^([a-zA-Z0-9_\-.]+)@([a-zA-Z0-9_\-.]+)\.([a-zA-Z]{2,5})$/.test(email)) {
                throw new GraphQLError('Email is not the right format.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check password validity */
            if (password && !passwordIsGoodEnough(password)) {
                throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check that username and password dont have space */
            if (username.indexOf(' ') !== -1 || password.indexOf(' ') !== -1) {
                throw new GraphQLError('Username or password cannot have spaces.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* Check if username has been used */
            const userExist = (await userCore.getUser(null, username, null))[0];
            if (userExist) {
                throw new GraphQLError('This username has been registered. Please sign-in or register with another username!', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check if email has been used */
            const emailExist = (await userCore.getUser(null, null, email))[0];
            if (emailExist) {
                throw new GraphQLError('This email has been registered. Please sign-in or register with another email!', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
            }

            /* randomly generate a secret for Time-based One Time Password*/
            const otpSecret = mfa.generateSecret();
            const user = await userCore.createUser(context?.req?.user?.id ?? null, username, email, firstname, lastname, organisation, enumUserTypes.STANDARD, false, password, otpSecret, null, description);

            /* send email to the registered user */
            // get QR Code for the otpSecret.
            const oauth_uri = `otpauth://totp/${config.appName}:${username}?secret=${otpSecret}&issuer=Data%20Science%20Institute`;
            const tmpobj = tmp.fileSync({ mode: 0o644, prefix: 'qrcodeimg-', postfix: '.png' });

            QRCode.toFile(tmpobj.name, oauth_uri, {}, function (err) {
                if (err) throw new GraphQLError(err.message);
            });

            const attachments = [{ filename: 'qrcode.png', path: tmpobj.name, cid: 'qrcode_cid' }];
            await mailer.sendMail({
                from: `${config.appName} <${config.nodemailer.auth.user}>`,
                to: email,
                subject: `[${config.appName}] Registration Successful`,
                html: `
                    <p>
                        Dear ${firstname},
                    <p>
                    <p>
                        Welcome to the ${config.appName} data portal!<br/>
                        Your username is <b>${username}</b>.<br/>
                    </p>
                    <p>
                        To login you will need to use a MFA authenticator app for one time passcode (TOTP).<br/>
                        Scan the QRCode below in your MFA application of choice to configure it:<br/>
                        <img src="cid:qrcode_cid" alt="QR code" width="150" height="150" /><br/>
                        If you need to type the token in use <b>${otpSecret.toLowerCase()}</b>
                    </p>
                    <br/>
                    <p>
                        The ${config.appName} Team.
                    </p>
                `,
                attachments: attachments
            });
            tmpobj.removeCallback();
            return user;
        },
        deleteUser: async (__unused__parent: Record<string, unknown>, { userId }: { userId: string }, context: any): Promise<IGenericResponse> => {
            /**
             * Delete a user.
             *
             * @param userId - The id of the user.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */

            const requester: IUser = context.req.user;

            /* Admins can delete anyone, while general user can only delete themself */
            if (!(requester.type === enumUserTypes.ADMIN) || !(requester.id === userId)) {
                throw new GraphQLError('', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }

            await userCore.deleteUser(requester.id, userId);

            return makeGenericReponse(userId, true, undefined, `User ${userId} has been deleted.`);
        },
        resetPassword: async (__unused__parent: Record<string, unknown>, { encryptedEmail, token, newPassword }: { encryptedEmail: string, token: string, newPassword: string }): Promise<IGenericResponse> => {
            /**
             * Reset the password of an account.
             *
             * @param encryptedEmail - The encrypted email of the user.
             * @param token - The id of the reset password request of the user.
             * @param newPassword - The new password.
             *
             * @return IGenericResponse - The object of IGenericResponse.
             */
            /* check password validity */
            if (!passwordIsGoodEnough(newPassword)) {
                throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check that username and password dont have space */
            if (newPassword.indexOf(' ') !== -1) {
                throw new GraphQLError('Password cannot have spaces.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* decrypt email */
            if (token.length < 16) {
                throw new GraphQLError('Token is invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            // TODO
            const salt = makeAESKeySalt(token);
            const iv = makeAESIv(token);
            let email;
            try {
                email = await decryptEmail(encryptedEmail, salt, iv);
            } catch (e) {
                throw new GraphQLError('Token is invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            const user = await userCore.processResetPasswordRequest(token, email, newPassword);
            /* need to log user out of all sessions */
            // TO_DO

            /* send email to the registered user */
            // get QR Code for the otpSecret.
            const oauth_uri = `otpauth://totp/${config.appName}:${user.username}?secret=${user.otpSecret}&issuer=Data%20Science%20Institute`;
            const tmpobj = tmp.fileSync({ mode: 0o644, prefix: 'qrcodeimg-', postfix: '.png' });

            QRCode.toFile(tmpobj.name, oauth_uri, {}, function (err) {
                if (err) throw new GraphQLError(err.message);
            });

            const attachments = [{ filename: 'qrcode.png', path: tmpobj.name, cid: 'qrcode_cid' }];
            await mailer.sendMail({
                from: `${config.appName} <${config.nodemailer.auth.user}>`,
                to: email,
                subject: `[${config.appName}] Password reset`,
                html: `
                    <p>
                        Dear ${user.firstname},
                    <p>
                    <p>
                        Your password on ${config.appName} is now reset!<br/>
                        You will need to update your MFA application for one-time passcode.<br/>
                    </p>
                    <p>
                        To update your MFA authenticator app you can scan the QRCode below to configure it:<br/>
                        <img src="cid:qrcode_cid" alt="QR code" width="150" height="150" /><br/>
                        If you need to type the token in use <b>${(user.otpSecret as string).toLowerCase()}</b>
                    </p>
                    <br/>
                    <p>
                        The ${config.appName} Team.
                    </p>
                `,
                attachments: attachments
            });
            tmpobj.removeCallback();
            return makeGenericReponse();
        },
        editUser: async (__unused__parent: Record<string, unknown>, { userId, username, type, firstname, lastname, email, emailNotificationsActivated, password, description, organisation, expiredAt, profile }: {
            userId: string, username: string | null, type: enumUserTypes | null, firstname: string | null, lastname: string | null, email: string | null, emailNotificationsActivated: boolean | null, password: string | null, description: string | null, organisation: string | null, expiredAt: number | null, profile: string | null
        }, context: any): Promise<Partial<IUser>> => {
            /**
             * Edit a user. Besides description, other fields whose values is null will not be updated.
             *
             * @param userId - The id of the user.
             * @param username - The username of the user.
             * @param type - The type of the user.
             * @param firstname - The first name of the user.
             * @param lastname - The last name of the user.
             * @param email - The email of the user.
             * @param emailNotificationsActivated - Whether the email notification is activated.
             * @param password - The password of the user.
             * @param description - The description of the user.
             * @param organisaiton - The organisation of the user.
             * @param expiredAt - The expiration time of the user.
             * @param profile - The profile of the user.
             *
             * @return Partial<IUser> - The object of IUser.
             */

            const requester: IUser = context.req.user;
            if (requester.type !== enumUserTypes.ADMIN && requester.id !== userId) {
                throw new GraphQLError('User can only edit his/her own information.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }

            if (requester.type !== enumUserTypes.ADMIN && (type || expiredAt || organisation)) {
                throw new GraphQLError('Standard user can not change their type, expiration time and organisation. Please contact admins for help.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
            }

            if (password && !passwordIsGoodEnough(password)) {
                throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check email is valid form */
            if (email && !/^([a-zA-Z0-9_\-.]+)@([a-zA-Z0-9_\-.]+)\.([a-zA-Z]{2,5})$/.test(email)) {
                throw new GraphQLError('Email is not the right format.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check password validity */
            if (password && !passwordIsGoodEnough(password)) {
                throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            /* check if email has been used */
            const emailExist = (await userCore.getUser(null, null, email))[0];
            if (emailExist) {
                throw new GraphQLError('This email has been registered. Please sign-in or register with another email!', { extensions: { code: ApolloServerErrorCode.BAD_USER_INPUT } });
            }
            if (requester.type !== enumUserTypes.ADMIN && (
                type || firstname || lastname || username || description || organisation
            )) {
                throw new GraphQLError('User not updated: Non-admin users are only authorised to change their password, email or email notification.');
            }

            const oldUser = (await userCore.getUser(userId, null, null))[0];
            if (!oldUser || !oldUser.password) {
                throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }

            const newUser = await userCore.editUser(requester.id, userId, username, email, firstname, lastname, organisation, type, emailNotificationsActivated, password, null, profile, description, expiredAt);
            if (newUser) {
                // New expiry date has been updated successfully.
                if (expiredAt && newUser.email && newUser.username) {
                    /* send email to client */
                    await mailer.sendMail(formatEmailRequestExpiryDateNotification({
                        to: newUser.email,
                        username: newUser.username
                    }));
                }
                return newUser;
            } else {
                throw new GraphQLError('Database error.', { extensions: { code: errorCodes.DATABASE_ERROR } });
            }
        }
    },
    Subscription: {}
};

async function formatEmailForForgottenPassword({ username, firstname, to, resetPasswordToken, origin }: { resetPasswordToken: string, to: string, username: string, firstname: string, origin: any }) {
    const keySalt = makeAESKeySalt(resetPasswordToken);
    const iv = makeAESIv(resetPasswordToken);
    const encryptedEmail = await encryptEmail(to, keySalt, iv);

    const link = `${origin}/reset/${encryptedEmail}/${resetPasswordToken}`;
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to,
        subject: `[${config.appName}] password reset`,
        html: `
            <p>
                Dear ${firstname},
            <p>
            <p>
                Your username is <b>${username}</b>.
            </p>
            <p>
                You can reset you password by click the following link (active for 1 hour):<br/>
                <a href=${link}>${link}</a>
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}

function formatEmailForFogettenUsername({ username, to }: { username: string, to: string }) {
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to,
        subject: `[${config.appName}] password reset`,
        html: `
            <p>
                Dear user,
            <p>
            <p>
                Your username is <b>${username}</b>.
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}

function formatEmailRequestExpiryDatetoClient({ username, to }: { username: string, to: string }) {
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to,
        subject: `[${config.appName}] New expiry date has been requested!`,
        html: `
            <p>
                Dear user,
            <p>
            <p>
                New expiry date for your <b>${username}</b> account has been requested.
                You will get a notification email once the request is approved.                
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}

function formatEmailRequestExpiryDatetoAdmin({ username, userEmail }: { username: string, userEmail: string }) {
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to: `${config.adminEmail}`,
        subject: `[${config.appName}] New expiry date has been requested from ${username} account!`,
        html: `
            <p>
                Dear ADMINs,
            <p>
            <p>
                A expiry date request from the <b>${username}</b> account (whose email address is <b>${userEmail}</b>) has been submitted.
                Please approve or deny the request ASAP.
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}

function formatEmailRequestExpiryDateNotification({ username, to }: { username: string, to: string }) {
    return ({
        from: `${config.appName} <${config.nodemailer.auth.user}>`,
        to,
        subject: `[${config.appName}] New expiry date has been updated!`,
        html: `
            <p>
                Dear user,
            <p>
            <p>
                New expiry date for your <b>${username}</b> account has been updated.
                You now can log in as normal.
            </p>
            <br/>
            <p>
                The ${config.appName} Team.
            </p>
        `
    });
}

function passwordIsGoodEnough(pw: string): boolean {
    if (pw.length < 8) {
        return false;
    }
    return true;
}
