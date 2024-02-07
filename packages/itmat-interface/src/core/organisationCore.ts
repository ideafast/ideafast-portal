import { db } from '../database/database';
import { GraphQLError } from 'graphql';
import { IOrganisation, IGenericResponse, enumFileTypes, enumFileCategories } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../graphql/responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../graphql/errors';
import { FileUpload } from 'graphql-upload-minimal';
import { fileCore } from './fileCore';
import { TRPCError } from '@trpc/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { enumTRPCErrorCodes } from 'packages/itmat-interface/test/utils/trpc';

export class OrganisationCore {

    public async getOrganisations(organisationId?: string): Promise<IOrganisation[]> {
        /**
         * Get the list of organisations. If input is null, return all organisaitons.
         *
         * @param organisationId - The id of the organisation.
         *
         * @return IOrganisation[] - The list of objects of IOrganisation.
         */

        if (!organisationId) {
            return await db.collections!.organisations_collection.find({ 'life.deletedTime': null }).toArray();
        } else {
            const organisation = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
            if (!organisation) {
                throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            } else {
                return [organisation];
            }
        }
    }

    /**
     * Create an organisation.
     *
     * @param requester - The id of the requester.
     * @param name - The name of the organisation.
     * @param shortname - The shortname of the organisation. Could be null.
     * @param location - The location of the organisation.
     * @param profile - The image of the file. Could be null.
     *
     * @return IOrganisation - The object of the organisation.
     */
    public async createOrganisation(requester: string, name: string, shortname?: string, location?: number[], profile?: FileUpload): Promise<IOrganisation> {
        const org = await db.collections!.organisations_collection.findOne({ 'name': name, 'life.deletedTime': null });
        if (org) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Organisation already exists.'
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
            fileEntry = await fileCore.uploadFile(requester, null, null, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.ORGANISATION_PROFILE_FILE, []);
        }
        const entry: IOrganisation = {
            id: uuid(),
            name: name,
            shortname: shortname ?? '',
            profile: (profile && fileEntry) ? fileEntry.id : null,
            location: location ?? [],
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        await db.collections!.organisations_collection.insertOne(entry);
        return entry;
    }

    /**
     * Delete an organisation.
     *
     * @param requester - The id of the requester.
     * @param organisationId - The id of the organisation.
     *
     * @return IOrganisation - The object of the organisation.
     */
    public async deleteOrganisation(requester: string, organisationId: string): Promise<IGenericResponse> {
        const org = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
        if (!org) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Organisation does not exist.'
            });
        }

        await db.collections!.organisations_collection.findOneAndUpdate({ id: organisationId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });

        return makeGenericReponse(organisationId, true, undefined, `Organisation ${org.name} has been deleted.`);
    }

    /**
     * Delete an organisation.
     *
     * @param requester - The id of the requester.
     * @param organisationId - The id of the organisation.
     * @param name - The name of the organisation.
     * @param location - The location of the organisation.
     * @param shortname - The shortname of the organisation.
     * @param profile - The profile of the organisation.
     *
     * @return IOrganisation - The object of the organisation.
     */
    public async editOrganisation(requester: string, organisationId: string, name?: string, shortname?: string, location?: number[], profile?: FileUpload): Promise<IGenericResponse> {
        const org = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
        if (!org) {
            throw new TRPCError({
                code: enumTRPCErrorCodes.BAD_REQUEST,
                message: 'Organisation does not exist.'
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
            fileEntry = await fileCore.uploadFile(requester, null, null, profile, undefined, enumFileTypes[(profile.filename.split('.').pop() || '').toUpperCase() as keyof typeof enumFileTypes], enumFileCategories.ORGANISATION_PROFILE_FILE, []);
        }

        await db.collections!.organisations_collection.findOneAndUpdate({ id: organisationId }, {
            $set: {
                name: name ?? org.name,
                shortname: shortname ?? org.shortname,
                location: location ?? org.location,
                profile: profile ? fileEntry?.id : null
            }
        });

        return makeGenericReponse(organisationId, true, undefined, `Organisation ${name ?? org.name} has been edited.`);
    }
}

export const organisationCore = Object.freeze(new OrganisationCore());
