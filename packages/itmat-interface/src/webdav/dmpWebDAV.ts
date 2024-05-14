import { IUser, v2 as webdav } from 'webdav-server';
import { Readable, Writable } from 'stream';
import { initTRPC } from '@trpc/server';
import { routers } from '../tRPC/procedures/index';
import { HTTPRequestContext } from 'webdav-server/lib/index.v2';
import jwt from 'jsonwebtoken';
import { userRetrieval, userRetrievalByUserId} from '../authentication/pubkeyAuthentication';
import nodeFetch from 'node-fetch';
import { IDriveNode, IStudy, enumUserTypes } from '@itmat-broker/itmat-types';

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
    router: any;
    isCopying: boolean;
    getFileResults: any;
    currentStudy: any;
    lastUpdateTime: number;
    shouldUpdate: boolean;

    constructor() {
        super(new DMPFileSystemSerializer());
        const t = initTRPC.create();
        this.router = t.router(routers);
        this.isCopying = false;
        // we use a temporaily cache for _readDir, we keep the cache of getFiles
        this.getFileResults = [];
        this.currentStudy = null;
        this.shouldUpdate = false;
        this.lastUpdateTime = Date.now();
    }

    override async _fastExistCheck(ctx: webdav.RequestContext, path: webdav.Path, callback: (exists: boolean) => void): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.user });
        const pathStr = path.toString();
        const pathArr = pathToArray(pathStr);
        if (pathStr === '/') {
            callback(true);
            return;
        } else {
            if (pathArr[0] === 'My Drive') {
                if (this.isCopying) {
                    callback(true);
                    return;
                }
                const userFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                    userId: (ctx.user as any).id
                });
                const ownUserFiles = userFileDir[(ctx.user as any).id];
                const allPaths = ownUserFiles.map((el: { path: any; }) => el.path.map((ek: any) => ownUserFiles.filter(es => es.id === ek)[0].name));
                callback(isPathIncluded(pathArr, allPaths));
                return;
            } else if (pathArr[0] === 'Shared') {
                if (pathArr.length == 1) {
                    callback(true);
                    return;
                }
                const usersFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                    userId: (ctx.user as any).id
                });
                const users = await caller.user.getUsers({});
                let allPaths: any[] = [];
                for (const userId of Object.keys(usersFileDir)) {
                    if (userId === (ctx.user as any).id) {
                        continue;
                    }
                    const user = users.filter((el: { id: string; }) => el.id === userId)[0];
                    const ownUserFiles = usersFileDir[userId].filter(el => el.path);
                    const validFileIds: string[] = ownUserFiles.map(el => el.id);
                    for (const item of ownUserFiles) {
                        item.path = item.path.filter(el => validFileIds.includes(el));
                    }
                    const partialPaths: any = ownUserFiles.map((el: { path: any; }) => el.path.map((ek: any) => ownUserFiles.filter(es => es.id === ek)[0].name));
                    partialPaths.forEach((element: any[]) => {
                        element.unshift(user ? `${user.firstname} ${user.lastname}` : 'NA');
                        element.unshift('Shared');
                    });
                    allPaths = [...allPaths, ...partialPaths];
                }
                callback(isPathIncluded(pathArr, allPaths));
                return;
            } else {
                if (pathArr.length === 1 && pathArr[0] === 'Study') {
                    callback(true);
                    return;
                } else {
                    const studies: IStudy[] = await caller.study.getStudies({});
                    const study = studies.filter(el => el.name === pathArr[1])[0];
                    if (!study) {
                        callback(false);
                        return;
                    } else {
                        callback(true);
                        return;
                    }
                }
            }
        }
    }

    override _displayName(path: webdav.Path, ctx: webdav.DisplayNameInfo, callback: webdav.ReturnCallback<string>): void {
        callback(undefined, 'Display name');
    }

    override _lockManager(path: webdav.Path, ctx: webdav.LockManagerInfo, callback: webdav.ReturnCallback<webdav.ILockManager>): void {
        callback(undefined, new webdav.LocalLockManager()); // Use local lock manager for simplicity
    }

    override _propertyManager(path: webdav.Path, ctx: webdav.PropertyManagerInfo, callback: webdav.ReturnCallback<webdav.IPropertyManager>): void {
        callback(undefined, new webdav.LocalPropertyManager()); // Use local property manager for simplicity
    }

    override _type(path: webdav.Path, ctx: webdav.TypeInfo, callback: webdav.ReturnCallback<webdav.ResourceType>): void {
        // Determine type based on path (directory if ends with '/', file otherwise)
        const fileExtensionRegex = /\.[^/]+$/;
        const isFile = fileExtensionRegex.test(path.toString());
        callback(undefined, isFile ? webdav.ResourceType.File : webdav.ResourceType.Directory);
        // callback(undefined, webdav.ResourceType.Directory);
    }

    override async _delete(path: webdav.Path, ctx: webdav.DeleteInfo, callback: webdav.SimpleCallback): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.context.user });
        const pathStr: string = path.toString();
        const pathArr = pathToArray(pathStr);
        if (pathArr.length <= 1) {
            callback(new Error('You can not edit the root node'));
        } else if (pathArr[1] === 'Study') {
            callback(new Error('You can not edit study data'));
        } else {
            const userFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                userId: (ctx.context.user as any).id
            });
            const ownUserFiles: IDriveNode[] = userFileDir[(ctx.context.user as any).id];
            const node: IDriveNode = ownUserFiles.filter(el => el.path.length === pathArr.length && el.path.every((part, index) => ownUserFiles.filter(ek => ek.id === part)[0].name === pathArr[index]))[0];
            await caller.drive.deleteDrive({
                driveId: node.id
            });
            callback(undefined);
        }
    }

    // TODO: upload file
    override async _create(path: webdav.Path, ctx: webdav.CreateInfo, callback: webdav.SimpleCallback): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.context.user });
        const pathStr: string = path.toString();
        const pathArr = pathToArray(pathStr);
        const fileExtensionRegex = /\.[^/]+$/;
        const isFile = fileExtensionRegex.test(pathStr);
        if (isFile) {
            this.isCopying = true;
            callback(undefined);
        } else {
            if (pathArr.length <= 1) {
                callback(new Error('You can not edit the root node'));
            } else if (pathArr[1] === 'Study') {
                callback(new Error('You can not edit study data'));
            } else {
                const parentPath = pathArr.slice(0, -1);
                const userFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                    userId: (ctx.context.user as any).id
                });
                const ownUserFiles: IDriveNode[] = userFileDir[(ctx.context.user as any).id];
                const parentNode = ownUserFiles.filter(el => el.path.every((part, index) => ownUserFiles.filter(ek => ek.id === part)[0].name === parentPath[index]) && el.path.length === parentPath.length)[0];
                if (!parentNode) {
                    callback(new Error('You need to create the parent folder first'));
                } else {
                    await caller.drive.createDriveFolder({
                        folderName: pathArr[pathArr.length - 1],
                        parentId: parentNode.id,
                        description: null
                    });
                    callback(undefined);
                }
            }
            callback(undefined);
        }
    }

    override async _openReadStream(path: webdav.Path, ctx: webdav.OpenReadStreamInfo, callback: webdav.ReturnCallback<Readable>): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.context.user });
        const pathStr: string = path.toString();
        const pathArr = pathToArray(pathStr);
        if (pathArr.length <= 1) {
            callback(new Error('You can not edit the root node'));
        } else if (pathArr[1] === 'Study') {
            callback(new Error('You can not edit study data'));
        } else {
            const userFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                userId: (ctx.context.user as any).id
            });
            const ownUserFiles: IDriveNode[] = userFileDir[(ctx.context.user as any).id];
            const node: IDriveNode = ownUserFiles.filter(el => el.path.length === pathArr.length && el.path.every((part, index) => ownUserFiles.filter(ek => ek.id === part)[0].name === pathArr[index]))[0];
            // TODO: replace with real url
            const fileUri = `${window.location.origin}/file/${node.fileId}`;
            try {
                // todo
                const response = await nodeFetch(fileUri);
                if (!response.ok) {
                    throw new Error('Failed to fetch file');
                }
                callback(undefined, response.body as any);
            } catch (error) {
                callback(error as any);
            }
        }
    }

    override async _openWriteStream(path: webdav.Path, ctx: webdav.OpenWriteStreamInfo, callback: webdav.ReturnCallback<Writable>): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.context.user });
        const pathStr: string = path.toString();
        const pathArr = pathToArray(pathStr);
        const fileBuffer: any[] = [];
        if (pathArr.length <= 1) {
            callback(new Error('You can not edit the root node'));
        } else if (pathArr[1] === 'Study') {
            callback(new Error('You can not edit study data'));
        } else {
            const userFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                userId: (ctx.context.user as any).id
            });
            const ownUserFiles: IDriveNode[] = userFileDir[(ctx.context.user as any).id];
            pathArr.pop();
            const parentNode: IDriveNode = ownUserFiles.filter(el => el.path.length === pathArr.length && el.path.every((part, index) => ownUserFiles.filter(ek => ek.id === part)[0].name === pathArr[index]))[0];
            if (!parentNode) {
                callback(new Error('Path does not exist.'));
            }

            let isFinalCalled = false;
            const writeableStream = new Writable({
                write(chunk, encoding, callback) {
                    fileBuffer.push(chunk);
                    callback();
                },
                final(callback) {
                    if (!isFinalCalled) {
                        isFinalCalled = true;
                        const fileData = {
                            parentId: parentNode.id,
                            description: null,
                            file: [{
                                fileBuffer: Buffer.concat(fileBuffer),
                                filename: path.fileName(),
                                size: fileBuffer.reduce((acc, b) => acc + b.length, 0)
                            }]
                        };
                        caller.drive.createDriveFile(fileData)
                            .then(() => callback(null))
                            .catch((err: Error | null | undefined) => callback(err));
                    }
                }
            });
            if (this.isCopying) {
                this.isCopying = false;
            }
            callback(undefined, writeableStream);
        }
    }

    override async _readDir(path: webdav.Path, ctx: webdav.ReadDirInfo, callback: webdav.ReturnCallback<string[] | webdav.Path[]>): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.context.user });
        const depth = (ctx.context.headers as any)['depth'];
        const pathStr: string = path.toString();
        try {
            // if path str is root, return my Drive and all studies
            if (pathStr === '/') {
                callback(undefined, ['My Drive', 'Study', 'Shared']);
            } else {
                const rootPath = pathToArray(pathStr);
                if (rootPath[0] === 'My Drive') {
                    const userFileDir = await caller.drive.getDrives({
                        userId: (ctx.context.user as any).id
                    });
                    const ownUserFiles = userFileDir[(ctx.context.user as any).id];
                    callback(undefined, convertToWebDAVPaths(ownUserFiles, depth, pathStr));
                    return;
                } else if (rootPath[0] === 'Shared') {
                    const usersFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
                        userId: (ctx.context.user as any).id
                    });
                    const users = await caller.user.getUsers({});
                    if (rootPath.length === 1) {
                        callback(undefined, Object.keys(usersFileDir).filter(el => el !== (ctx.context.user as any).id).map(el => {
                            const user = users.filter((es: { id: string; }) => es.id === el)[0];
                            return user ? `${user.firstname} ${user.lastname}` : 'NA';
                        }));
                        return;
                    }

                    let allPaths: any[] = [];
                    for (const userId of Object.keys(usersFileDir)) {
                        if (userId === (ctx.context.user as any).id) {
                            continue;
                        }
                        const user = users.filter((el: { id: string; }) => el.id === userId)[0];
                        const ownUserFiles = usersFileDir[userId].filter(el => el.path);
                        const validFileIds: string[] = ownUserFiles.map(el => el.id);
                        for (const item of ownUserFiles) {
                            item.path = item.path.filter(el => validFileIds.includes(el));
                        }
                        const partialPaths: any = convertToWebDAVPaths(ownUserFiles, depth, pathStr, ['Shared', `${user.firstname} ${user.lastname}`]);
                        const completePaths: string[][] = partialPaths.map((el: any) => {
                            return ['Shared', `${user.firstname} ${user.lastname}`, el];
                        });
                        allPaths = [...allPaths, ...completePaths];
                    }
                    callback(undefined, allPaths.map(el => el[el.length - 1]));
                    return;
                }
                else {
                    const studies: IStudy[] = await caller.study.getStudies({});
                    if (rootPath.length === 1) {
                        callback(undefined, studies.map(el => el.name));
                        return;
                    } else {
                        const study = studies.filter(el => el.name === rootPath[1])[0];
                        if (study.id !== this.currentStudy) {
                            this.shouldUpdate = true;
                        }
                        this.currentStudy = study.id;
                        if (!study) {
                            callback(new Error('Path not found.'));
                            return;
                        } else {
                            if (this.shouldUpdate) {
                                // update cache
                                this.getFileResults = await caller.data.getFiles({
                                    studyId: study.id,
                                    versionId: null,
                                    useCache: false,
                                    forceUpdate: false
                                });
                            }
                            this.shouldUpdate = false;
                            const allPaths = this.getFileResults.map((el: { path: string[]; }) => ['Study'].concat(el.path));
                            const children = getDirectChildren(allPaths, pathToArray(pathStr));
                            callback(undefined, children);
                            return;
                        }
                    }
                }
            }
        }
        catch (error) {
            callback(new Error('Error generating files'));
            return;
        }
    }

    override async _copy(pathFrom: webdav.Path, pathTo: webdav.Path, ctx: webdav.CopyInfo, callback: webdav.ReturnCallback<boolean>): Promise<void> {
        callback(undefined, false);
    }

    override async _move(pathFrom: webdav.Path, pathTo: webdav.Path, ctx: webdav.MoveInfo, callback: webdav.ReturnCallback<boolean>): Promise<void> {
        const caller = this.router.createCaller({ user: ctx.context.user });
        function findNodeIdFromPath(pathArr: string[], allPathIds: string[][]) {
            const filtered = allPathIds.filter(el => {
                return el.length === pathArr.length && el.every((part, index) => pathArr[index] === part[0]);
            })[0];
            return filtered[filtered.length - 1][1];
        }
        const userFileDir: Record<string, IDriveNode[]> = await caller.drive.getDrives({
            userId: (ctx.context.user as any).id
        });
        const ownUserFiles = userFileDir[(ctx.context.user as any).id];
        const allPathsIds = ownUserFiles.map((el: { path: any; }) => el.path.map((ek: any) => {
            return [ownUserFiles.filter(es => es.id === ek)[0].name, ownUserFiles.filter(es => es.id === ek)[0].id];
        }));
        const sourceNodeId = findNodeIdFromPath(pathToArray(pathFrom.toString()), allPathsIds);
        const targetNodeId = findNodeIdFromPath(pathToArray(pathTo.toString()).slice(0, -1), allPathsIds);
        await caller.drive.editDrive({
            driveId: sourceNodeId,
            managerId: null,
            name: null,
            description: null,
            parentId: targetNodeId,
            children: null,
            sharedUsers: null,
            sharedGroups: null
        });
        callback(undefined, true);
    }

}

// The customized HTTPAuthentication interface
interface HTTPAuthentication {
    askForAuthentication(): { [headerName: string]: string; };
    getUser(ctx: HTTPRequestContext, callback: (error: Error | null, user?: IUser) => void): void;
}

// The DMPWebDAVAuthentication class implementing the above interface
export class DMPWebDAVAuthentication implements HTTPAuthentication {
    realm: string;
    constructor(realm?: string) {
        this.realm = realm ?? 'realm';
    }
    askForAuthentication(): { 'WWW-Authenticate': string; } {
        return {
            'WWW-Authenticate': 'Basic realm="' + this.realm + '"'
        };
    }

    getUser(ctx: webdav.HTTPRequestContext, callback: (error: Error | null, user?: IUser) => void): void {
        const token = (ctx.headers as any).headers['authorization'];
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
        const userId = (decodedPayload as any).userId;  // Capture userId from the decoded token, if available.

        jwt.verify(token, pubkey, (error: any) => {
            if (error) {
                callback(new Error('Unauthorized: Invalid credentials.'), undefined);
                return;
            }
            // retrieval the user by pubkey or userId(system token)

            // Decide the retrieval method based on whether a userId is present
            const userRetrievalPromise = userId
                ? userRetrievalByUserId(userId)
                : userRetrieval(pubkey);

            // Now that the token is verified, retrieve the associated user.
            userRetrievalPromise.then(associatedUser => {
                const formattedUser = {
                    ...associatedUser,
                    uid: associatedUser.id,
                    isAdministrator: associatedUser.type === enumUserTypes.ADMIN,
                    isDefaultUser: false
                };
                callback(null, formattedUser); // Use `null` instead of `undefined` here to indicate no error
            }).catch(() => {
                callback(new Error('Token Not recognized.'), undefined); // Pass `undefined` for the user if there's an error
            });
        });
    }
}

function pathToArray(path: string) {
    return path.split('/').filter(Boolean);
}

function convertToWebDAVPaths(ownUserFiles: any, depth: any, pathStr: string, prefix?: string[]): string[] {
    const allPaths = ownUserFiles.map((el: { path: any; }) => el.path.map((ek: any) => ownUserFiles.filter((es: { id: any; }) => es.id === ek)[0].name));
    const basePath = pathToArray(pathStr);
    if (prefix) {
        const result = allPaths.map((el: ConcatArray<string>) => prefix.concat(el));
        return getDirectChildren(result, basePath);
    }
    return getDirectChildren(allPaths, basePath);
}

function getDirectChildren(allPaths: any, basePath: string[]): string[] {
    const basePathLength = basePath.length;
    const directChildren = new Set<string>();

    for (const path of allPaths) {
        // Check if the current path is a direct child of the basePath
        if (path.length > basePathLength && basePath.every((part, index) => part === path[index])) {
            directChildren.add(path[basePathLength]);
        }
    }

    return Array.from(directChildren);
}

function isPathIncluded(givenPath: string[], paths: string[][]): boolean {
    return paths.some(path =>
        givenPath.every((part, index) => part === path[index])
    );
}

