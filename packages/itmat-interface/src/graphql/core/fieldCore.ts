import { IField, enumDataTypes, IUser } from '@itmat-broker/itmat-types';
import { db } from '../../database/database';
import { v4 as uuid } from 'uuid';
export class FieldCore {
    public async getFieldsOfStudy(studyId: string, detailed: boolean, getOnlyTheseFields?: string[]): Promise<IField[]> {
        /* ASSUMING projectId and studyId match*/
        /* if detailed=false, only returns the fieldid in an array */
        /* constructing queryObj; if projectId is provided then only those in the approved fields are returned */
        let queryObj: any = { studyId };
        if (getOnlyTheseFields) {  // if both study id and project id are provided then just make sure they belong to each other
            queryObj = { studyId, fieldId: { $in: getOnlyTheseFields } };
        }

        const aggregatePipeline: any = [
            { $match: queryObj }
        ];
        /* if detailed=false, only returns the fieldid in an array */
        if (detailed === false) {
            aggregatePipeline.push({ $group: { _id: null, array: { $addToSet: '$fieldId' } } });
        }

        const cursor = db.collections!.field_dictionary_collection.aggregate<IField>(aggregatePipeline);
        return cursor.toArray();
    }

}


export function validateAndGenerateFieldEntry(fieldEntry: any, requester: IUser) {
    // duplicates with existing fields are checked by caller function
    const error: string[] = [];
    const complusoryField = [
        'fieldId',
        'fieldName',
        'dataType'
    ];

    // check missing field
    for (const key of complusoryField) {
        if (fieldEntry[key] === undefined && fieldEntry[key] === null) {
            error.push(`${key} should not be empty.`);
        }
    }
    // only english letters, numbers and _ are allowed in fieldIds
    if (!/^[a-zA-Z0-9_]*$/.test(fieldEntry.fieldId || '')) {
        error.push('FieldId should contain letters, numbers and _ only.');
    }
    // data types
    if (!Object.values(enumDataTypes).includes(fieldEntry.dataType)) {
        error.push(`Data type shouldn't be ${fieldEntry.dataType}: use 'int' for integer, 'dec' for decimal, 'str' for string, 'bool' for boolean, 'date' for datetime, 'file' for FILE, 'json' for json.`);
    }
    // check possiblevalues to be not-empty if datatype is categorical
    if (fieldEntry.dataType === enumDataTypes.CATEGORICAL) {
        if (fieldEntry.possibleValues !== undefined && fieldEntry.possibleValues !== null) {
            if (fieldEntry.possibleValues.length === 0) {
                error.push(`${fieldEntry.fieldId}-${fieldEntry.fieldName}: possible values can't be empty if data type is categorical.`);
            }
            for (let i = 0; i < fieldEntry.possibleValues.length; i++) {
                fieldEntry.possibleValues[i]['id'] = uuid();
            }
        } else {
            error.push(`${fieldEntry.fieldId}-${fieldEntry.fieldName}: possible values can't be empty if data type is categorical.`);
        }
    }

    const newField: any = {
        fieldId: fieldEntry.fieldId,
        fieldName: fieldEntry.fieldName,
        tableName: fieldEntry.tableName,
        dataType: fieldEntry.dataType,
        possibleValues: fieldEntry.dataType === enumDataTypes.CATEGORICAL ? fieldEntry.possibleValues : null,
        unit: fieldEntry.unit,
        comments: fieldEntry.comments,
        metadata: {
            'uploader:org': requester.organisation,
            'uploader:user': requester.id,
            ...fieldEntry.metadata
        }
    };

    return { fieldEntry: newField, error: error };
}

export const fieldCore = Object.freeze(new FieldCore());
