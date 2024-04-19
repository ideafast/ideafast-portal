import { IDomain, IGenericResponse, enumFileCategories, enumFileTypes, enumTRPCErrorCodes } from '@itmat-broker/itmat-types';
import { db } from '../database/database';
import { FileUpload } from 'graphql-upload-minimal';
import { TRPCError } from '@trpc/server';
import { fileCore } from './fileCore';
import { v4 as uuid } from 'uuid';
import { makeGenericReponse } from '../graphql/responses';
export class DomainCore {
    public async getDomains(domainId?: string, domainName?: string, domainPath?: string): Promise<IDomain[]> {
        const obj: any = {};
        if (domainId) {
            obj.domainId = domainId;
        }
        if (domainName) {
            obj.name = domainName;
        }
        if (domainPath) {
            obj.domainPath = domainPath;
        }

        return (await db.collections?.domains_collection.find(obj).toArray()) as IDomain[];
    }

    public async createDomain(requester: string, domainName: string, domainPath: string, profile?: FileUpload, color?: string): Promise<IDomain> {
        const domain = await db.collections!.domains_collection.findOne({ '$or': [{ name: domainName }, { domainPath: domainPath }], 'life.deletedTime': null });
        if (domain) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Domain already exists.'
            });
        }
        let fileEntry;

        if (profile) {
            if (!Object.keys(enumFileTypes).includes((profile?.filename?.split('.').pop() || '').toUpperCase())) {
                throw new TRPCError({
                    code: enumTRPCErrorCodes.BAD_REQUEST,
                    message: 'File type not supported.'
                });
            }
            fileEntry = await fileCore.uploadFile(requester, null, null, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.DOMAIN_PROFILE_FILE, []);
        }

        const entry: IDomain = {
            id: uuid(),
            name: domainName,
            domainPath: domainPath,
            logo: (profile && fileEntry) ? fileEntry.id : undefined,
            color: color,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        await db.collections!.domains_collection.insertOne(entry);
        return entry;
    }

    public async deleteDomain(requester: string, domainId: string): Promise<IGenericResponse> {
        const domain = await db.collections!.domains_collection.findOne({ id: domainId });
        if (!domain) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Domain already exists.'
            });
        }

        await db.collections!.domains_collection.findOneAndUpdate({ id: domain.id }, {
            $set: {
                'life.deletedUser': requester,
                'life.deletedTime': Date.now()
            }
        });
        if (domain.logo) {
            await db.collections!.files_collection.findOneAndUpdate({ id: domain.logo }, {
                $set: {
                    'life.deletedUser': requester,
                    'life.deletedTime': Date.now()
                }
            });
        }
        return makeGenericReponse(domainId, true, undefined, `Domain ${domain.name} has been deleted`);
    }
}

export const domainCore = Object.freeze(new DomainCore());