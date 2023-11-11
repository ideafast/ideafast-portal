import { IUser, v2 as webdav } from 'webdav-server';
import { Client as MinioClient, BucketItemStat } from 'minio';
import { Readable } from 'stream';
import { objStore } from '../objStore/objStore';
import { initTRPC } from '@trpc/server';
import { object, z } from 'zod';
import { routers } from '../tRPC/procedures/index';
import { HTTPRequestContext } from 'webdav-server/lib/index.v2';
import jwt from 'jsonwebtoken';
import { userRetrieval } from '../authentication/pubkeyAuthentication';
import { enumUserTypes } from '@itmat-broker/itmat-types';
class DMPFileSystemSerializer implements webdav.FileSystemSerializer {
    uid(): string {
        return 'MinioFileSystem-1.0'; // Unique identifier with versioning
    }

    serialize(fs: webdav.FileSystem, callback: webdav.ReturnCallback<any>): void {
        if (fs instanceof DMPFileSystem) {
            // we won't actually serialize anything.
            callback(undefined, {});
        } else {
            callback(new Error('Invalid file system type'), undefined);
        }
    }

    unserialize(serializedData: any, callback: webdav.ReturnCallback<webdav.FileSystem>): void {
        const fs = new DMPFileSystem();
        callback(undefined, fs);
    }

}

export class DMPFileSystem extends webdav.FileSystem {
    caller: any;
    constructor() {
        super(new DMPFileSystemSerializer());
        // initialize a trpc caller for server side call
        const t = initTRPC.create();

        const router = t.router(routers);

        this.caller = router.createCaller({});
    }

    override _lockManager(path: webdav.Path, ctx: webdav.LockManagerInfo, callback: webdav.ReturnCallback<webdav.ILockManager>): void {
        callback(undefined, new webdav.LocalLockManager()); // Use local lock manager for simplicity
    }

    override _propertyManager(path: webdav.Path, ctx: webdav.PropertyManagerInfo, callback: webdav.ReturnCallback<webdav.IPropertyManager>): void {
        callback(undefined, new webdav.LocalPropertyManager()); // Use local property manager for simplicity
    }

    override _type(path: webdav.Path, ctx: webdav.TypeInfo, callback: webdav.ReturnCallback<webdav.ResourceType>): void {
        // Determine type based on path (directory if ends with '/', file otherwise)
        const isDirectory = /\/$/.test(path.toString());
        callback(undefined, isDirectory ? webdav.ResourceType.Directory : webdav.ResourceType.File);
    }

    // override async _

    override async _readDir(path: webdav.Path, ctx: webdav.ReadDirInfo, callback: webdav.ReturnCallback<string[] | webdav.Path[]>): Promise<void> {
        console.log('Path ', path);
        try {
            const results = await this.caller.data.getFiles({
                studyId: '96f17282-e0a3-43d3-8f38-326949b786ef',
                versionId: null,
                useCache: false,
                forceUpdate: false
            });
            const userFile = await this.caller.drive.getDrives({
                userId: (ctx.context.user as any).id,
                rootId: null
            });
            console.log('user files', Object.keys(userFile).length);
            console.log('results', results.length);
        } catch {
            console.log('error');
        }
        callback(undefined, ['测试文件.txt']);
    }
}

// The customized HTTPAuthentication interface
interface HTTPAuthentication {
    askForAuthentication(): { [headerName: string]: string; };
    getUser(ctx: HTTPRequestContext, callback: (error: Error | null, user?: IUser) => void): void;
}

// The DMPWebDAVAuthentication class implementing the above interface
export class DMPWebDAVAuthentication implements HTTPAuthentication {
    askForAuthentication(): { 'WWW-Authenticate': string; } {
        return {
            'WWW-Authenticate': 'Basic realm="User Visible Realm", charset="UTF-8"'
        };
    }

    getUser(ctx: webdav.HTTPRequestContext, callback: (error: Error | null, user?: IUser) => void): void {
        const token = (ctx.headers as any).headers['authorization']; // Directly access the 'authorization' header
        if (!token) {
            callback(new Error('Unauthorized: No token provided.'), undefined);
            return;
        }

        // Assume jwt.decode is synchronous and can return null/undefined if the token cannot be decoded
        const decodedPayload = jwt.decode(token);
        if (!decodedPayload) {
            callback(new Error('Invalid token: Cannot decode.'), undefined);
            return;
        }
        const pubkey = (decodedPayload as any).publicKey;
        jwt.verify(token, pubkey, (error: any, decoded: any) => {
            if (error) {
                callback(new Error('Unauthorized: Invalid credentials.'), undefined);
                return;
            }

            // Now that the token is verified, retrieve the associated user.
            userRetrieval(pubkey).then(associatedUser => {
                const formattedUser = {
                    ...associatedUser,
                    uid: associatedUser.id,
                    isAdministrator: associatedUser.type === enumUserTypes.ADMIN,
                    isDefaultUser: false
                };
                console.log('----Passed crenditials.');
                callback(null, formattedUser); // Use `null` instead of `undefined` here to indicate no error
            }).catch(err => {
                callback(new Error('Token Not recognized.'), undefined); // Pass `undefined` for the user if there's an error
            });
        });
    }
}




