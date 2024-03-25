import type { IData, IField, IFile, IJob, ILog, IOrganisation, IProject, IPubkey, IQueryEntry, IRole, IStudy, IUser, IStandardization, IConfig, IOntologyTree, IDoc, IDriveNode, IGroupNode, IInstance } from '@itmat-broker/itmat-types';
import { IDatabaseBaseConfig } from '@itmat-broker/itmat-commons';
import type { Collection } from 'mongodb';
import { ICache } from 'packages/itmat-types/src/types/cache';
export interface IDatabaseConfig extends IDatabaseBaseConfig {
    collections: {
        users_collection: string,
        jobs_collection: string,
        studies_collection: string,
        projects_collection: string,
        queries_collection: string,
        field_dictionary_collection: string,
        roles_collection: string,
        files_collection: string,
        organisations_collection: string,
        log_collection: string,
        pubkeys_collection: string,
        data_collection: string,
        standardizations_collection: string,
        configs_collection: string,
        ontologies_collection: string,
        docs_collection: string,
        cache_collection: string,
        drives_collection: string,
        groups_collection: string,
        'colddata_collection': string,
        instance_collection: string
    };
}

export interface IDatabaseCollectionConfig {
    users_collection: Collection<IUser>,
    jobs_collection: Collection<IJob>,
    studies_collection: Collection<IStudy>,
    projects_collection: Collection<IProject>,
    queries_collection: Collection<IQueryEntry>,
    field_dictionary_collection: Collection<IField>,
    roles_collection: Collection<IRole>,
    files_collection: Collection<IFile>,
    organisations_collection: Collection<IOrganisation>,
    log_collection: Collection<ILog>,
    pubkeys_collection: Collection<IPubkey>,
    data_collection: Collection<IData>,
    standardizations_collection: Collection<IStandardization>,
    configs_collection: Collection<IConfig>,
    ontologies_collection: Collection<IOntologyTree>,
    docs_collection: Collection<IDoc>,
    cache_collection: Collection<ICache>,
    drives_collection: Collection<IDriveNode>,
    groups_collection: Collection<IGroupNode>,
    colddata_collection: Collection<IData>,
    instance_collection: Collection<IInstance>
}

// export const db = new DatabaseBase<IDatabaseBaseConfig, IDatabaseCollectionConfig>();
