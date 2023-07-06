import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { IOrganisation, IGenericResponse } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';

export class OrganisationCore {

    public async getOrganisations(organisationId: string | null): Promise<IOrganisation[]> {
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

    public async createOrganisation(requester: string, name: string, shortname: string | null, location: number[] | null, profile: string | null): Promise<IOrganisation> {
        /**
         * Create an organisation.
         *
         * @param requester - The id of the requester.
         * @param name - The name of the organisation.
         * @param shortname - The shortname of the organisation. Could be null.
         * @param location - The location of the organisation.
         * @param profile - The id of the image of the profile of the organisation. Could be null.
         *
         * @return IOrganisation - The object of the organisation.
         */

        const org = await db.collections!.organisations_collection.findOne({ 'name': name, 'life.deletedTime': null });
        if (org) {
            throw new GraphQLError('Organisation already exists.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
        }
        if (profile) {
            const profileFile = await db.collections!.files_collection.findOne({ 'id': profile, 'life.deletedTime': null });
            if (!profileFile) {
                throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_MALFORMED_INPUT } });
            }
        }

        const entry: IOrganisation = {
            id: uuid(),
            name: name,
            shortname: shortname,
            profile: profile,
            location: location,
            life: {
                createdTime: Date.now(),
                createdUser: requester,
                deletedTime: null,
                deletedUser: null
            },
            metadata: {}
        };
        const result = await db.collections!.organisations_collection.insertOne(entry);
        if (result.acknowledged) {
            return entry;
        } else {
            throw new GraphQLError('Database error', { extensions: { code: errorCodes.DATABASE_ERROR } });
        }
    }

    public async deleteOrganisation(requester: string, organisationId: string): Promise<IGenericResponse> {
        /**
         * Delete an organisation.
         *
         * @param requester - The id of the requester.
         * @param organisationId - The id of the organisation.
         *
         * @return IOrganisation - The object of the organisation.
         */

        const org = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
        if (!org) {
            throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }

        await db.collections!.organisations_collection.findOneAndUpdate({ id: organisationId }, {
            $set: {
                'life.deletedTime': Date.now(),
                'life.deletedUser': requester
            }
        });

        return makeGenericReponse(organisationId, true, undefined, `Organisation ${org.name} has been deleted.`);
    }

    public async editOrganisation(organisationId: string, name: string | null, shortname: string | null, location: number[] | null, profile: string | null): Promise<IGenericResponse> {
        /**
         * Delete an organisation.
         *
         * @param organisationId - The id of the organisation.
         * @param name - The name of the organisation.
         * @param location - The location of the organisation.
         * @param shortname - The shortname of the organisation.
         * @param profile - The profile of the organisation.
         *
         * @return IOrganisation - The object of the organisation.
         */

        const org = await db.collections!.organisations_collection.findOne({ 'id': organisationId, 'life.deletedTime': null });
        if (!org) {
            throw new GraphQLError('Organisation does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
        }
        if (profile) {
            const profileFile = await db.collections!.files_collection.findOne({ 'id': profile, 'life.deletedTime': null });
            if (!profileFile) {
                throw new GraphQLError('Profile file does not exist.', { extensions: { code: errorCodes.CLIENT_ACTION_ON_NON_EXISTENT_ENTRY } });
            }
        }

        await db.collections!.organisations_collection.findOneAndUpdate({ id: organisationId }, {
            $set: {
                name: name ?? org.name,
                shortname: shortname ?? org.shortname,
                profile: profile ?? org.profile
            }
        });

        return makeGenericReponse(organisationId, true, undefined, `Organisation ${name ?? org.name} has been edited.`);
    }
}

export const organisationCore = Object.freeze(new OrganisationCore());
