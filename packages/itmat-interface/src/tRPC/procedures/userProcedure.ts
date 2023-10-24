import { IResetPasswordRequest, IUser, enumFileCategories, enumFileTypes, enumGroupNodeTypes, enumUserTypes } from '@itmat-broker/itmat-types';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { custom, z } from 'zod';
import { userCore } from '../../graphql/core/userCore';
import { GraphQLError } from 'graphql';
import { errorCodes } from '../../graphql/errors';
import { makeGenericReponse } from '../../graphql/responses';
import bcrypt from 'bcrypt';
import * as mfa from '../../utils/mfa';
import { mailer } from '../../emailer/emailer';
import { decryptEmail, encryptEmail, makeAESIv, makeAESKeySalt } from '../../encryption/aes';
import config from '../../utils/configManager';
import { Logger } from '@itmat-broker/itmat-commons';
import { v4 as uuid } from 'uuid';
import { Readable } from 'stream';
import QRCode from 'qrcode';
import tmp from 'tmp';
import { FileUpload } from 'graphql-upload-minimal';
import { type } from 'os';
import { fileCore } from '../../graphql/core/fileCore';
import { baseProcedure } from '../../log/trpcLogHelper';
const createContext = ({
    req,
    res
}: trpcExpress.CreateExpressContextOptions) => ({}); // no context
type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const userRouter = t.router({
    /**
     * Return the object of IUser of the current requester.
     *
     * @return Record<string, unknown> - The object of IUser.
     */
    whoAmI: baseProcedure.query(async (opts: any) => {
        return opts.ctx.req.user ?? null;
    }),
    /**
     * Get the list of users.
     *
     * @param userId - The id of the user. If null, return all users.
     * @return Partial<IUser>[] - The list of objects of IUser.
     */
    getUsers: baseProcedure.input(z.object({
        userId: z.union([z.string(), z.null()])
    })).query(async (opts: any) => {
        const requester: IUser = opts.ctx.req.user;
        const users = opts.input.userId ? await userCore.getUser(opts.input.userId, null, null) : await userCore.getAllUsers(false);
        /* If user is admin, or user is asking info of own, then return all info. Otherwise, need to remove private info. */
        const priority = requester.type === enumUserTypes.ADMIN || requester.id === opts.input.userId;
        const clearedUsers: Partial<IUser>[] = [];
        if (!(requester.type === enumUserTypes.ADMIN) || !(requester.id === opts.input.userId)) {
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
                }
                clearedUsers.push(cleared);
            }
        }
        return users as Partial<IUser>[];
    }),
    /**
     * Refresh the existing session to avoid timeout. Express will update the session as long as there is a new query in.
     *
     * @return IGenericResponse - The obejct of IGenericResponse.
     */
    recoverSessionExpireTime: baseProcedure.query(() => {
        return makeGenericReponse();
    }),
    /**
     * Get the url of the profile of the user.
     *
     * @param userId - The id of the user.
     *
     * @return string
     */
    getUserProfile: baseProcedure.input(z.object({
        userId: z.string()
    })).query(async (opts: any) => {
        const url = await userCore.getUserProfile(opts.input.userId);
        return url;
    }),
    /**
     * Get the list of file nodes of a user.
     *
     * @param userId - The id of the user.
     *
     * @return IFileNode[]
     */
    // getUserFileNodes: baseProcedure.input(z.object({
    //     userId: z.string()
    // })).query(async (opts: any) => {
    //     const requester: IUser = opts.ctx.req.user;

    //     if (!(requester.type === enumUserTypes.ADMIN) || !(requester.id === opts.input.userId)) {
    //         throw new GraphQLError('', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
    //     }
    //     return await userCore.getFileNodes(opts.input.userId);
    // }),

    /**
     * Ask for a request to extend account expiration time. Send notifications to user and admin.
     *
     * @param userId - The id of the user.
     *
     * @return IGenericResponse - The object of IGenericResponse
     */
    requestExpiryDate: baseProcedure.input(z.object({
        userId: z.string()
    })).mutation(async (opts: any) => {
        const user = (await userCore.getUser(opts.input.userId, null, null))[0];
        if (!user || !user.email || !user.username) {
            /* even user is null. send successful response: they should know that a user doesn't exist */
            await new Promise(resolve => setTimeout(resolve, Math.random() * 6000));
            return makeGenericReponse(opts.input.userId, false, undefined, 'User information is not correct.');
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

        return makeGenericReponse(opts.input.userId, true, undefined, 'Request successfully sent.');
    }),
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
    requestUsernameOrResetPassword: baseProcedure.input(z.object({
        forgotUsername: z.boolean(),
        forgotPassword: z.boolean(),
        email: z.union([z.string(), z.null()]),
        username: z.union([z.string(), z.null()])
    })).mutation(async (opts: any) => {
        /* checking the args are right */
        if ((opts.input.forgotUsername && !opts.input.email) // should provide email if no username
            || (opts.input.forgotUsername && opts.input.username) // should not provide username if it's forgotten.
            || (!opts.input.email && !opts.input.username)) {
            throw new GraphQLError('Inputs are invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        } else if (opts.input.email && opts.input.username) {
            // TO_DO : better client erro
            /* only provide email if no username */
            throw new GraphQLError('Inputs are invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check user existence */
        const user = (await userCore.getUser(null, opts.input.username, opts.input.email))[0];
        if (!user) {
            /* even user is null. send successful response: they should know that a user doesn't exist */
            await new Promise(resolve => setTimeout(resolve, Math.random() * 6000));
            return makeGenericReponse(undefined, false, undefined, 'User does not exist.');
        }

        if (opts.input.forgotPassword) {
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
                origin: opts.req.headers.origin
            }));
        } else {
            /* send email to client */
            await mailer.sendMail(formatEmailForFogettenUsername({
                to: user.email ?? '',
                username: user.username ?? ''
            }));
        }
        return makeGenericReponse(user.id, true, undefined, 'Request of resetting password successfully sent.');
    }),
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
    login: baseProcedure.input(z.object({
        username: z.string(),
        password: z.string(),
        totp: z.string(),
        requestexpirydate: z.union([z.boolean(), z.null()])
    })).mutation(async (opts: any) => {
        const req = opts.ctx.req;
        const user = (await userCore.getUser(null, opts.input.username, null))[0];
        if (!user || !user.password || !user.otpSecret || !user.email || !user.username) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const passwordMatched = await bcrypt.compare(opts.input.password, user.password);
        if (!passwordMatched) {
            throw new GraphQLError('Incorrect password.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* validate the TOTP */
        const totpValidated = mfa.verifyTOTP(opts.input.totp, user.otpSecret);
        if (!totpValidated) {
            if (process.env.NODE_ENV === 'development')
                console.warn('Incorrect One-Time password. Continuing in development ...');
            else
                throw new GraphQLError('Incorrect One-Time password.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* validate if account expired */
        if (user.expiredAt && user.expiredAt < Date.now() && user.type === enumUserTypes.STANDARD) {
            if (opts.input.requestexpirydate) {
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
                throw new GraphQLError('New expiry date has been requested! Wait for ADMIN to approve.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }

            throw new GraphQLError('Account Expired. Please request a new expiry date!', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        const filteredUser: Partial<IUser> = { ...user };
        delete filteredUser.password;
        delete filteredUser.otpSecret;

        return new Promise((resolve) => {
            req.login(filteredUser, (err: any) => {
                if (err) {
                    Logger.error(err);
                    throw new GraphQLError('Cannot log in. Please try again later.');
                }
                resolve(filteredUser);
            });
        });
    }),
    /**
     * Logout an account.
     *
     * @return IGenericResponse - The object of IGenericResponse.
     */
    logout: baseProcedure.mutation((opts: any) => {
        const requester: IUser = opts.req.user;
        const req: Express.Request = opts.req;
        if (!requester) {
            return makeGenericReponse(undefined, false, undefined, 'Requester not known.');
        }
        return new Promise((resolve) => {
            req.logout((err) => {
                if (err) {
                    Logger.error(err);
                    throw new GraphQLError('Cannot log out');
                } else {
                    resolve(makeGenericReponse(opts.req.user));
                }
            });
        });
    }),
    /**
     * Create a user.
     *
     * @param username - The username of the user.
     * @param firstname - The firstname of the user.
     * @param lastname - The lastname of the user.
     * @param email - The email of the user.
     * @param password - The password of the user.
     * @param description - The description of the user.
     * @param organisation - The organisation of the user.
     * @param profile - The profile of the user.
     *
     * @return IUser
     */
    createUser: baseProcedure.input(z.object({
        username: z.string(),
        firstname: z.string(),
        lastname: z.string(),
        email: z.string(),
        password: z.string(),
        description: z.union([z.string(), z.null()]),
        organisation: z.string(),
        profile: z.union([z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        })), z.null()])
    })).mutation(async (opts: any) => {
        /* check email is valid form */
        if (!/^([a-zA-Z0-9_\-.]+)@([a-zA-Z0-9_\-.]+)\.([a-zA-Z]{2,5})$/.test(opts.input.email)) {
            throw new GraphQLError('Email is not the right format.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check password validity */
        if (opts.input.password && !passwordIsGoodEnough(opts.input.password)) {
            throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check that username and password dont have space */
        if (opts.input.username.indexOf(' ') !== -1 || opts.input.password.indexOf(' ') !== -1) {
            throw new GraphQLError('Username or password cannot have spaces.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* Check if username has been used */
        const userExist = (await userCore.getUser(null, opts.input.username, null))[0];
        if (userExist) {
            throw new GraphQLError('This username has been registered. Please sign-in or register with another username!', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check if email has been used */
        const emailExist = (await userCore.getUser(null, null, opts.input.email))[0];
        if (emailExist) {
            throw new GraphQLError('This email has been registered. Please sign-in or register with another email!', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* randomly generate a secret for Time-based One Time Password*/
        const otpSecret = mfa.generateSecret();

        /* Check file upload */
        let profile_ = null;
        if (opts.input.profile) {
            profile_ = await opts.input.profile[0];
        }
        const user = await userCore.createUser(opts.req?.user?.id ?? null, opts.input.username, opts.input.email, opts.input.firstname, opts.input.lastname, opts.input.organisation, enumUserTypes.STANDARD, false, opts.input.password, otpSecret, profile_, opts.input.description);

        /* send email to the registered user */
        // get QR Code for the otpSecret.
        const oauth_uri = `otpauth://totp/${config.appName}:${opts.input.username}?secret=${otpSecret}&issuer=Data%20Science%20Institute`;
        const tmpobj = tmp.fileSync({ mode: 0o644, prefix: 'qrcodeimg-', postfix: '.png' });

        QRCode.toFile(tmpobj.name, oauth_uri, {}, function (err) {
            if (err) throw new GraphQLError(err.message);
        });

        const attachments = [{ filename: 'qrcode.png', path: tmpobj.name, cid: 'qrcode_cid' }];
        await mailer.sendMail({
            from: `${config.appName} <${config.nodemailer.auth.user}>`,
            to: opts.input.email,
            subject: `[${config.appName}] Registration Successful`,
            html: `
                    <p>
                        Dear ${opts.input.firstname},
                    <p>
                    <p>
                        Welcome to the ${config.appName} data portal!<br/>
                        Your username is <b>${opts.input.username}</b>.<br/>
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
    }),
    /**
     * Delete a user.
     *
     * @param userId - The id of the user.
     *
     * @return IGenericResponse - The object of IGenericResponse.
     */
    deleteUser: baseProcedure.input(z.object({
        userId: z.string()
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.req.user;

        /* Admins can delete anyone, while general user can only delete themself */
        if (!(requester.type === enumUserTypes.ADMIN) && !(requester.id === opts.inpt.userId)) {
            throw new GraphQLError('', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
        }

        await userCore.deleteUser(requester.id, opts.inpt.userId);

        return makeGenericReponse(opts.inpt.userId, true, undefined, `User ${opts.inpt.userId} has been deleted.`);
    }),
    /**
     * Reset the password of an account.
     *
     * @param encryptedEmail - The encrypted email of the user.
     * @param token - The id of the reset password request of the user.
     * @param newPassword - The new password.
     *
     * @return IGenericResponse - The object of IGenericResponse.
     */
    resetPassword: baseProcedure.input(z.object({
        encryptedEmail: z.string(),
        token: z.string(),
        newPassword: z.string()
    })).mutation(async (opts: any) => {
        if (!passwordIsGoodEnough(opts.input.newPassword)) {
            throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check that username and password dont have space */
        if (opts.input.newPassword.indexOf(' ') !== -1) {
            throw new GraphQLError('Password cannot have spaces.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* decrypt email */
        if (opts.input.token.length < 16) {
            throw new GraphQLError('Token is invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        // TODO
        const salt = makeAESKeySalt(opts.input.token);
        const iv = makeAESIv(opts.input.token);
        let email;
        try {
            email = await decryptEmail(opts.input.encryptedEmail, salt, iv);
        } catch (e) {
            throw new GraphQLError('Token is invalid.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        const user = await userCore.processResetPasswordRequest(opts.input.token, email, opts.input.newPassword);
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
    }),
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
    editUser: baseProcedure.input(z.object({
        userId: z.string(),
        username: z.union([z.string(), z.null()]),
        type: z.union([z.nativeEnum(enumUserTypes), z.null()]),
        firstname: z.union([z.string(), z.null()]),
        lastname: z.union([z.string(), z.null()]),
        email: z.union([z.string(), z.null()]),
        password: z.union([z.string(), z.null()]),
        description: z.union([z.string(), z.null()]),
        organisation: z.union([z.string(), z.null()]),
        profile: z.union([z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        })), z.null()])
    })).mutation(async (opts: any) => {
        const requester: IUser = opts.req.user;
        if (requester.type !== enumUserTypes.ADMIN && requester.id !== opts.input.userId) {
            throw new GraphQLError('User can only edit his/her own information.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
        }

        if (requester.type !== enumUserTypes.ADMIN && (opts.input.type || opts.input.expiredAt || opts.input.rganisation)) {
            throw new GraphQLError('Standard user can not change their type, expiration time and organisation. Please contact admins for help.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
        }

        if (opts.input.password && !passwordIsGoodEnough(opts.input.password)) {
            throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check email is valid form */
        if (opts.input.email && !/^([a-zA-Z0-9_\-.]+)@([a-zA-Z0-9_\-.]+)\.([a-zA-Z]{2,5})$/.test(opts.input.email)) {
            throw new GraphQLError('Email is not the right format.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check password validity */
        if (opts.input.password && !passwordIsGoodEnough(opts.input.password)) {
            throw new GraphQLError('Password has to be at least 8 character long.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }

        /* check if email has been used */
        const emailExist = (await userCore.getUser(null, null, opts.input.email))[0];
        if (emailExist) {
            throw new GraphQLError('This email has been registered. Please sign-in or register with another email!', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        if (requester.type !== enumUserTypes.ADMIN && (
            opts.input.type || opts.input.firstname || opts.input.lastname || opts.input.username || opts.input.description || opts.input.organisation
        )) {
            throw new GraphQLError('User not updated: Non-admin users are only authorised to change their password, email or email notification.');
        }

        const oldUser = (await userCore.getUser(opts.input.userId, null, null))[0];
        if (!oldUser || !oldUser.password) {
            throw new GraphQLError('User does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        let profile_ = null;
        if (opts.input.profile) {
            profile_ = await opts.input.profile[0];
        }
        const newUser = await userCore.editUser(requester.id, opts.input.userId, opts.input.username, opts.input.email, opts.input.firstname, opts.input.lastname, opts.input.organisation, opts.input.type, opts.input.emailNotificationsActivated, opts.input.password, null, profile_, opts.input.description, opts.input.expiredAt);
        if (newUser) {
            // New expiry date has been updated successfully.
            if (opts.input.expiredAt && newUser.email && newUser.username) {
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
    }),
    /**
     * Upload a profile of a user.
     *
     * @param userId - The id of the user.
     * @param description - The description of the file.
     * @param fileType - The type of the file.
     * @param fileUpload - The file upload.
     *
     * @retunr IGenericResponse
     */
    uploadUserProfile: baseProcedure.input(z.object({
        userId: z.string(),
        description: z.union([z.string(), z.null()]),
        fileType: z.nativeEnum(enumFileTypes),
        fileUpload: z.array(z.object({
            fileBuffer: z.instanceof(Buffer),
            filename: z.string(),
            mimetype: z.string(),
            size: z.number()
            // ... other validation ...
        }))
    })).mutation(async (opts: any) => {
        const requester = opts.req.user;

        if (requester.type !== enumUserTypes.ADMIN || requester.id !== opts.input.userId) {
            throw new GraphQLError('User can only upload profile of themself.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
        }

        const file = await opts.input.fileUpload[0];

        const supportedFormats: string[] = [enumFileTypes.JPG, enumFileTypes.JPEG, enumFileTypes.PNG];
        if (!(supportedFormats.includes(file.filename.split('.')[1].toUpperCase()))) {
            throw new GraphQLError('Only JPG, JPEG and PNG are supported.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        const res = await fileCore.uploadFile(
            requester.id,
            null,
            opts.input.userId,
            file,
            opts.input.description,
            enumFileTypes[file.filename.split('.')[1].toUpperCase() as keyof typeof enumFileTypes],
            enumFileCategories.USER_PROFILE_FILE,
            []
        );
        if (res) {
            return makeGenericReponse(res.id, true, '', 'Profile has been uploaded successfully');
        } else {
            throw new GraphQLError(errorCodes.DATABASE_ERROR);
        }
    }),
    /**
     * Add/Upload a file to the user file repo.
     *
     * @param requester - The id of the requester.
     * @param userId - The id of the user of the file repo. Usually should be the same as The id of the requester.
     * @param parentNodeId - The id of the file Node.
     * @param file - The file to upload.
     * @param folderName - The name of the folder. Should be numm if file is not null.
     *
     * @return IGenericResponse - The object of the IGenericResponse.
     */
    // uploadUserFileNode: baseProcedure.input(z.object({
    //     userId: z.string(),
    //     parentNodeId: z.string(),
    //     file: z.union([z.array(z.object({
    //         fileBuffer: z.instanceof(Buffer),
    //         filename: z.string(),
    //         mimetype: z.string(),
    //         size: z.number()
    //         // ... other validation ...
    //     })), z.null()]),
    //     folderName: z.string()
    // })).mutation(async (opts: any) => {
    //     const requester = opts.req.user;
    //     if (requester.type !== enumUserTypes.ADMIN || requester.id !== opts.input.userId) {
    //         throw new GraphQLError('User can only upload file of themself.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
    //     }
    //     let file_;
    //     if (opts.input.file) {
    //         file_ = await opts.input.file[0];
    //         if (file_) {
    //             const supportedFormats: string[] = Object.keys(enumFileTypes);
    //             if (!(supportedFormats.includes((file_.filename.split('.').pop() as string).toUpperCase()))) {
    //                 throw new GraphQLError('Only JPG, JPEG and PNG are supported.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
    //             }
    //         }
    //     }
    //     const fileNode: IFileNode = await userCore.addFileNodeToUserRepo(requester.id, opts.input.userId, opts.input.parentNodeId, null, file_ ? enumFileTypes[(file_.filename.split('.').pop() as string).toUpperCase() as keyof typeof enumFileTypes] : null, file_, opts.input.folderName);
    //     return fileNode;
    // }),
    /**
     * Edit the file node of a user.
     *
     * @param userId - The id of the user.
     * @param parentNodeId - The ids of the parent node id.
     * @param sharedUsers - The list of shared users.
     *
     * @return IGenericResponse
     */
    // editUserFileNode: baseProcedure.input(z.object({
    //     userId: z.string(),
    //     nodeId: z.string(),
    //     parentNodeId: z.union([z.string(), z.null()]),
    //     sharedUsers: z.union([z.array(z.string()), z.null()])
    // })).mutation(async (opts: any) => {
    //     const requester = opts.req.user;

    //     if (requester.type !== enumUserTypes.ADMIN || requester.id !== opts.input.userId) {
    //         throw new GraphQLError('User can only upload file of themself.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
    //     }

    //     if (opts.input.parentNodeId) {
    //         await userCore.moveFileNodeFromUserRepo(opts.input.userId, opts.input.nodeId, opts.input.parentNodeId);
    //     }
    //     if (opts.input.sharedUsers) {
    //         await userCore.shareFileNodeToUsers(opts.input.userId, opts.input.nodeId, opts.input.sharedUsers);
    //     }

    //     return makeGenericReponse(opts.input.nodeId, true, undefined, undefined);
    // }),
    /**
     * Edit the file node of a user.
     *
     * @param userId - The id of the user.
     * @param parentNodeId - The ids of the parent node id.
     * @param sharedUserEmails - The list of emails of shared users.
     *
     * @return IGenericResponse
     */
    // shareUserFileNodeByEmail: baseProcedure.input(z.object({
    //     userId: z.string(),
    //     nodeId: z.string(),
    //     sharedUserEmails: z.array(z.string())
    // })).mutation(async (opts: any) => {
    //     const requester = opts.req.user;

    //     if (requester.type !== enumUserTypes.ADMIN || requester.id !== opts.input.userId) {
    //         throw new GraphQLError('User can only upload file of themself.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
    //     }

    //     const userIds: string[] = [];

    //     for (const email of opts.input.sharedUserEmails) {
    //         const users = await userCore.getUser(null, null, email);
    //         if (users.length === 1) {
    //             userIds.push(users[0].id);
    //         }
    //     }

    //     const response = await userCore.shareFileNodeToUsers(opts.input.serId, opts.input.nodeId, userIds);

    //     return response;
    // }),
    /**
     * Delete a file node. Note we only tag the node as deleted.
     *
     * @param userId - The id of the user.
     * @param nodeId - The id of the node.
     *
     * @reutrn IGenericResponse
     */
    // deleteUserFileNode: baseProcedure.input(z.object({
    //     userId: z.string(),
    //     nodeId: z.string()
    // })).mutation(async (opts: any) => {
    //     const requester = opts.req.user;

    //     if (requester.type !== enumUserTypes.ADMIN || requester.id !== opts.input.userId) {
    //         throw new GraphQLError('User can only upload file of themself.', { extensions: { code: errorCodes.NO_PERMISSION_ERROR } });
    //     }
    //     const respone = await userCore.deleteFileNodeFromUserRepo(requester.id, opts.input.userId, opts.input.nodeId);
    //     return respone;
    // })
    /**
     * Get the list of groups of a study.
     *
     * @param studyId - The id of the study.
     *
     * @return Partial<IGroupNode>[]
     */
    /**
     * Create a user group.
     *
     * @param studyId - The id of the study.
     * @param groupName - The name of the study.
     * @param groupType - The type of the group.
     * @param description - The description of the group.
     * @param parentGroupId - The id of the parent group.
     *
     * @return IGroupNode - The object of IGroupNode
     */
    createUserGroup: baseProcedure.input(z.object({
        studyId: z.union([z.string(), z.null()]),
        reference: z.string(),
        groupNodeType: z.nativeEnum(enumGroupNodeTypes),
        description: z.union([z.string(), z.null()]),
        parentGroupNodeId: z.union([z.string(), z.null()])
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;

        const group = await userCore.createUserGroup(requester.id, opts.input.studyId, opts.input.reference, opts.input.groupNodeType, opts.input.description, opts.input.parentGroupNodeId);
        return group;
    }),
    /**
     * Edit a group.
     *
     * @param studyId - The id of the study.
     * @param groupId - The id of the group.
     * @param description - The new description of the group.
     * @param targetParentId - The id of the target parent.
     * @param children - The ids of the children groups of the group.
     *
     * @return IGenericResponse - The object of IGenericRespnse
     */
    editUserGroup: baseProcedure.input(z.object({
        managerId: z.union([z.string(), z.null()]),
        groupNodeId: z.string(),
        groupNodeName: z.union([z.string(), z.null()]),
        description: z.union([z.string(), z.null()]),
        parentGroupNodeId: z.string(),
        children: z.union([z.string(), z.null()])
    })).mutation(async (opts: any) => {
        const requester = opts.ctx.req.user;

        const response = await userCore.editUserGroup(opts.input.managerId, opts.input.groupNodeId, opts.input.groupNodeName, opts.input.description, opts.input.parentGroupNodeId, opts.input.children);
        return response;
    }),
    /**
     * Delete a group of a study.
     *
     * @param requester - The id of the requester.
     * @param studyId - The id of the study.
     * @param groupId - The id of the group.
     *
     * @return IGenericResponse - The object of IGenericResponse.
     */
    deleteStudyGroupNode: baseProcedure.input(z.object({
        groupNodeId: z.string()
    })).mutation(async (opts: any) => {
        const requester = opts.req.user;

        const response = await userCore.deleteUserGroup(requester.id, opts.input.groupNodeId);
        return response;
    }),
    getUserGroups: baseProcedure.input(z.object({
        studyId: z.string()
    })).query(async (opts: any) => {
        const groups = await userCore.getUserGroups(opts.input.studyId);
        return groups;
    })
});


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
