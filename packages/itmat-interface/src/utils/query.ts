import { IStudy, IFieldEntry, enumValueType, IStandardizationRule, IOntologyPath } from 'itmat-commons';
/*
    queryString:
        format: string                  # returned foramt: raw, standardized, grouped, summary
        data_requested: array           # returned fields
        cohort: array[array]            # filters
        new_fields: array               # new_fields

*/
// if has study-level permission, non versioned data will also be returned

interface IStandardizationWithoutId {
    name: string,
    stdRules: IStandardizationRule[],
    ontologyPath: IOntologyPath[]
}

export function buildPipeline(query: any, studyId: string, validDataVersion: string, hasPermission: boolean, fieldsList: any[]) {
    // // parse the input data versions first
    let dataVersionsFilter: any;
    // for data managers; by default will return unversioned data; to return only versioned data, specify a data version
    if (hasPermission) {
        dataVersionsFilter = { $match: { $or: [ { m_versionId: null }, { m_versionId: { $in: validDataVersion } } ] } };
    } else {
        dataVersionsFilter = { $match: { m_versionId: { $in: validDataVersion } } };
    }
    const fields = { _id: 0, m_subjectId: 1, m_visitId: 1 };

    // We send back the requested fields, by default send all fields
    if (query['data_requested'] !== undefined && query['data_requested'] !== null) {
        query.data_requested.forEach((field: any) => {
            if (fieldsList.includes(field)) {
                (fields as any)[field] = 1;
            }
        });
    } else {
        fieldsList.forEach((field: any) => {
            (fields as any)[field] = 1;
        });
    }
    const addFields = {};
    // We send back the newly created derived fields by default
    if (query['new_fields'] !== undefined && query['new_fields'] !== null) {
        if (query.new_fields.length > 0) {
            query.new_fields.forEach((field: any) => {
                if (field.op === 'derived') {
                    (fields as any)[field.name] = 1;
                    (addFields as any)[field.name] = createNewField(field.value);
                } else {
                    return 'Error';
                }
            });
        }
    }
    let match = {};
    // We send back the filtered fields values
    if (query['cohort'] !== undefined && query['cohort'] !== null) {
        if (query.cohort.length > 1) {
            const subqueries: any = [];
            query.cohort.forEach((subcohort: any) => {
                // addFields.
                subqueries.push(translateCohort(subcohort));
            });
            match = { $or: subqueries };
        } else {
            match = translateCohort(query.cohort[0]);
        }
    }
    if (isEmptyObject(addFields)) {
        return [
            { $match: { m_studyId: studyId } },
            { $match: { $or: [ match, { m_versionId: '0' } ] } },
            dataVersionsFilter,
            { $sort: { m_subjectId: -1, m_visitId: -1 } },
            { $project: fields }
        ];
    } else {
        return [
            { $match: { m_studyId: studyId } },
            { $addFields: addFields },
            { $match: { $or: [ match, { m_versionId: '0' } ] } },
            dataVersionsFilter,
            { $sort: { m_subjectId: -1, m_visitId: -1 } },
            { $project: fields }
        ];
    }
}

function createNewField(expression: any) {
    let newField = {};
    // if any parameters === '99999', then ignore this calculation
    switch (expression.op) {
        case '*':
            newField = {
                $cond: [
                    {
                        $or: [
                            { $eq: [{ $type: createNewField(expression.left) }, 'string'] },
                            { $eq: [{ $type: createNewField(expression.right) }, 'string'] },
                        ]
                    },
                    '99999',
                    {
                        $multiply: [createNewField(expression.left), createNewField(expression.right)]
                    }
                ]
            };
            break;
        case '/':
            newField = {
                $cond: [
                    {
                        $or: [
                            { $eq: [{ $type: createNewField(expression.left) }, 'string'] },
                            { $eq: [{ $type: createNewField(expression.right) }, 'string'] },
                        ]
                    },
                    '99999',
                    {
                        $divide: [createNewField(expression.left), createNewField(expression.right)]
                    }
                ]
            };
            break;
        case '-':
            newField = {
                $cond: [
                    {
                        $or: [
                            { $eq: [{ $type: createNewField(expression.left) }, 'string'] },
                            { $eq: [{ $type: createNewField(expression.right) }, 'string'] },
                        ]
                    },
                    '99999',
                    {
                        $subtract: [createNewField(expression.left), createNewField(expression.right)]
                    }
                ]
            };
            break;
        case '+':
            newField = {
                $cond: [
                    {
                        $or: [
                            { $eq: [{ $type: createNewField(expression.left) }, 'string'] },
                            { $eq: [{ $type: createNewField(expression.right) }, 'string'] },
                        ]
                    },
                    '99999',
                    {
                        $add: [createNewField(expression.left), createNewField(expression.right)]
                    }
                ]
            };
            break;
        case '^':
            newField = {
                $cond: [
                    { $eq: [{ $type: createNewField(expression.left) }, 'string'] },
                    '99999',
                    {
                        // NB the right side my be an integer while the left must be a field !
                        $pow: ['$' + expression.left, parseInt(expression.right, 10)]
                    }
                ]
            };
            break;
        case 'val':
            newField = parseFloat(expression.left);
            break;
        case 'field':
            newField = {
                $cond: [
                    { $eq: [{ $type: createNewField(expression.left) }, 'string'] },
                    '99999',
                    '$' + expression.left
                ]
            };
            break;
        default:
            break;
    }

    return newField;
}


function isEmptyObject(obj: any) {
    return !Object.keys(obj).length;
}


function translateCohort(cohort: any) {
    const match = {};

    cohort.forEach(function (select: any) {

        switch (select.op) {
            case '=':
                // select.value must be an array
                (match as any)[select.field] = { $in: [select.value] };
                break;
            case '!=':
                // select.value must be an array
                (match as any)[select.field] = { $ne: [select.value] };
                break;
            case '<':
                // select.value must be a float
                (match as any)[select.field] = { $lt: parseFloat(select.value) };
                break;
            case '>':
                // select.value must be a float
                (match as any)[select.field] = { $gt: parseFloat(select.value) };
                break;
            case 'derived': {
                // equation must only have + - * /
                const derivedOperation = select.value.split(' ');
                if (derivedOperation[0] === '=') {
                    (match as any)[select.field] = { $eq: parseFloat(select.value) };
                }
                if (derivedOperation[0] === '>') {
                    (match as any)[select.field] = { $gt: parseFloat(select.value) };
                }
                if (derivedOperation[0] === '<') {
                    (match as any)[select.field] = { $lt: parseFloat(select.value) };
                }
                break;
            }
            case 'exists':
                // We check if the field exists. This is to be used for checking if a patient
                // has an image
                (match as any)[select.field] = { $exists: true };
                break;
            case 'count': {
                // counts can only be positive. NB: > and < are inclusive e.g. < is <=
                const countOperation = select.value.split(' ');
                const countfield = select.field + '.count';
                if (countOperation[0] === '=') {
                    (match as any)[countfield] = { $eq: parseInt(countOperation[1], 10) };
                }
                if (countOperation[0] === '>') {
                    (match as any)[countfield] = { $gt: parseInt(countOperation[1], 10) };
                }
                if (countOperation[0] === '<') {
                    (match as any)[countfield] = { $lt: parseInt(countOperation[1], 10) };
                }
                break;
            }
            default:
                break;
        }
    }
    );
    return match;
}


// attributes are fields that should be included in the standardization result; if not, leave it empty
// STUDYID ans USUBJID will be joined automatically
const domains = {
    DM: {
        name: 'Demographics',
        attributes: ['DOMAIN', 'SITEID', 'AGE', 'AGEU', 'SEX', 'RACE'],
    },
    MH: {
        name: 'Medical History',
        attributes: ['DOMAIN', 'MHSEQ', 'MHTERM', 'MHDTC', 'MHSTDTC', 'MHENDTC'],
    },
    VS: {
        name: 'Vital Sign',
        attributes: ['DOMAIN', 'VSSEQ', 'VSTESTCD', 'VSTEST', 'VSPOS', 'VSORRES', 'VSORRESU', 'VSSTRESN', 'VSSTRESU', 'VISITNUM', 'VSDTC'],
    },
    LB: {
        name: 'Laboratory Test',
        attributes: ['DOMAIN', 'LBSEQ', 'LBTESTCD', 'LBTEST', 'LBCAT', 'LBORRES', 'LBORRESU', 'LBSTRESC', 'LBSTRESN', 'LBSPEC', 'VISITNUM'],
    },
    QS: {
        name: 'Questionnaire',
        attributes: ['DOMAIN', 'QSSEQ', 'QSTESTCD', 'QSTEST', 'QSCAT', 'QSORRES', 'QSORRESU', 'QSSTRESC', 'QSSTRESU', 'QSSTRESN', 'VISITNUM'],
    },
    CM: {
        name: 'Concomitant Medications',
        attributes: ['DOMAIN', 'CMSEQ', 'CMTRT', 'CMCAT', 'CMDOSTXT', 'CMDOSU'],
    },
    FT: {
        name: 'Function Test',
        attributes: ['DOMAIN', 'FTSEQ', 'FTCAT', 'FTORRES', 'FTORRESU', 'FTDTC', 'FTTESTCD', 'FTTEST', 'VISITNUM'],
    },
    IE: {
        name: 'Inclusion and Exclusion',
        attributes: ['IESEQ', 'IETESTCD', 'IETEST', 'IECAT', 'IEORRES', 'IEORRESC', 'VISITNUM']
    }
};

export function dataStandardization(study:IStudy, fields: IFieldEntry[], data: any, format: string, derivedRules?: IStandardizationWithoutId[]) {
    if (format === undefined || format === 'raw') {
        return data;
    } else if (format === 'grouped' || format === 'summary') {
        return dataGrouping(data, format);
    } else if (format === 'cdisc-sdtm') {
        return cdiscSDTM(study, fields, data, format, derivedRules || []);
    }
    return { error: 'Format not recognized.'};
}

// fields are obtained from called functions, providing the valid fields
export function cdiscSDTM(study: IStudy, fields: IFieldEntry[], data: any, format: string, derivedRules: IStandardizationWithoutId[]) {
    const records = Object.keys(domains).reduce((acc, curr) => {
        acc[curr] = [];
        return acc;
    }, {});
    for (const subjectId of Object.keys(data).sort()) {
        // The sequence number is assigned to each standardized record in order in some domains; thus, the order may change in different versions
        const seqNumDic: any = Object.keys(domains).reduce((acc, curr) => {
            acc[curr] = {};
            return acc;
        }, {});
        for (const visitId of Object.keys(data[subjectId]).sort((a, b) => { return parseFloat(a) - parseFloat(b); })) {
            for (const fieldId of Object.keys(data[subjectId][visitId])) {
                // check field existing in current data version
                let fieldDef: any = fields.filter(el => el.fieldId === fieldId.toString())[0];
                if (fieldDef === undefined || fieldDef === null || fieldDef.standardization === undefined) {
                    // check if it is derived field, if so use the rules from derivedRules
                    if (derivedRules.filter(el => el.name === fieldId).length === 1) {
                        fieldDef = {
                            fieldId: fieldId,
                            fieldName: fieldId,
                            standardization: derivedRules.filter(el => el.name === fieldId)[0]
                        };
                    } else {
                        continue;
                    }
                    continue;
                }
                // check if this standard exists
                if (fieldDef.standardization.filter(el => el.name === format).length !== 1) {
                    return { error: `${format} is not found or more than one ${format} are defined.` };
                }
                const formatIndex: number = fieldDef.standardization.findIndex(el => el.name === format);
                // check if DOMAIN exists
                const attributeIndexMapping = fieldDef.standardization[formatIndex].stdRules.reduce((acc, curr, index) => {
                    acc[curr['name']] = index;
                    return acc;
                }, {});
                if (!Object.keys(attributeIndexMapping).includes('DOMAIN')) {
                    continue;
                }
                // set shouldIgnore flag
                let isIgnored = false;
                const thisDomainDef = fieldDef.standardization[formatIndex].stdRules[attributeIndexMapping['DOMAIN']];
                // parse VS, LB, QS, FT
                let dataClip = {};
                if (['VS', 'LB', 'QS', 'FT', 'IE'].includes(thisDomainDef['parameter'])) {
                    fieldDef.standardization[formatIndex].stdRules.forEach(el => {
                        switch (el['source']) {
                            case 'data': {
                                // for multiple levels; use -> as delimiter
                                const chain = el['parameter'] === '' ? [] : el['parameter'].split('->');
                                let tmpData = data[subjectId][visitId][fieldId];
                                chain.forEach(el => {
                                    tmpData = tmpData[el] || '';
                                });
                                dataClip[el['name']] = tmpData;
                                if (el.ignoreValues && el.ignoreValues.includes(tmpData)) {
                                    isIgnored = true;
                                }
                                break;
                            }
                            case 'fieldDef': {
                                dataClip[el['name']] = fieldDef[el['parameter']];
                                break;
                            }
                            case 'value': {
                                dataClip[el['name']] = el['parameter'];
                                break;
                            }
                            case 'inc': {
                                if (seqNumDic[thisDomainDef['parameter']][subjectId] === undefined) {
                                    seqNumDic[thisDomainDef['parameter']][subjectId] = 1;
                                }
                                dataClip[el['name']] = seqNumDic[thisDomainDef['parameter']][subjectId]++;
                                break;
                            }
                        }
                        // check if there is a dict
                        if (el['dict'] !== null) {
                            dataClip[el['name']] = el['dict'][dataClip[el['name']]] || '';
                        }
                    });
                    dataClip['VISITNUM'] = visitId;
                } else if (fieldDef.standardization[formatIndex].stdRules[attributeIndexMapping['DOMAIN']]['parameter'] === 'DM') {
                    // find the DM in records; otherwise create a new one
                    dataClip = records[fieldDef.standardization[formatIndex].stdRules[attributeIndexMapping['DOMAIN']]['parameter']].filter(el =>
                        el.USUBJID === subjectId)[0];
                    if (dataClip === undefined) {
                        dataClip = {};
                    }
                    fieldDef.standardization[formatIndex].stdRules.forEach(el => {
                        switch (el['source']) {
                            case 'data': {
                                // for multiple levels; use -> as delimiter
                                const chain = el['parameter'] === '' ? [] : el['parameter'].split('->');
                                let tmpData = data[subjectId][visitId][fieldId];
                                chain.forEach(el => {
                                    tmpData = tmpData[el] || '';
                                });
                                dataClip[el['name']] = tmpData;
                                break;
                            }
                            case 'fieldDef': {
                                dataClip[el['name']] = fieldDef.standardization[formatIndex][el['parameter']];
                                break;
                            }
                            case 'value': {
                                dataClip[el['name']] = el['parameter'];
                                break;
                            }
                        }
                        // check if there is a dict
                        if (el['dict'] !== null) {
                            dataClip[el['name']] = el['dict'][dataClip[el['name']]] || '';
                        }
                    });
                } else if (fieldDef.standardization[formatIndex].stdRules[attributeIndexMapping['DOMAIN']]['parameter'] === 'MH') {
                    // in the original record, MH is considered as a boolean type for each of the MH term
                    // if not have, ignore
                    if (data[subjectId][visitId][fieldId].toString() === '0') {
                        continue;
                    }
                    fieldDef.standardization[formatIndex].stdRules.forEach(el => {
                        switch (el['source']) {
                            case 'data': {
                                // for multiple levels; use -> as delimiter
                                const chain = el['parameter'] === '' ? [] : el['parameter'].split('->');
                                let tmpData = data[subjectId][visitId][fieldId];
                                chain.forEach(el => {
                                    tmpData = tmpData[el] || '';
                                });
                                dataClip[el['name']] = tmpData;
                                break;
                            }
                            case 'fieldDef': {
                                dataClip[el['name']] = fieldDef[el['parameter']];
                                break;
                            }
                            case 'value': {
                                dataClip[el['name']] = el['parameter'];
                                break;
                            }
                        }
                        // check if there is a dict
                        if (el['dict'] !== null) {
                            // use default dict
                            if (Object.keys(el['dict']).length === 0 && fieldDef.dataType === enumValueType.CATEGORICAL && fieldDef.possibleValues !== undefined) {
                                dataClip[el['name']] = fieldDef.possibleValues[dataClip[el['name']]] || '';
                            } else {
                                dataClip[el['name']] = el['dict'][dataClip[el['name']]] || '';
                            }
                        }
                    });
                } else {
                    continue;
                }
                // check if should be ignored
                if (isIgnored) {
                    continue;
                }
                dataClip['STUDYID'] = study.name;
                dataClip['USUBJID'] = subjectId;
                // check if need to replace the DM record
                if (thisDomainDef.name === 'DOMAIN' && thisDomainDef.parameter === 'DM') {
                    const dmIndex = records[fieldDef.standardization[formatIndex].stdRules[attributeIndexMapping['DOMAIN']]['parameter']].findIndex(el =>
                        el.USUBJID === subjectId);
                    if (dmIndex === -1) {
                        records[thisDomainDef['parameter']].push(dataClip);
                    } else {
                        records[thisDomainDef['parameter']].splice(dmIndex, 1);
                        records[thisDomainDef['parameter']].splice(dmIndex, 0, dataClip);
                    }
                } else {
                    records[thisDomainDef['parameter']].push(dataClip);
                }
            }
        }
    }
    return records;
}

// ignore the subjectId, join values with same visitId and fieldId; with extra info
export function dataGrouping(data: any, format: string) {
    const joinedData: any = {};
    for (const subjectId of Object.keys(data)) {
        for (const visitId of Object.keys(data[subjectId])) {
            for (const fieldId of Object.keys(data[subjectId][visitId])) {
                if (['m_subjectId', 'm_visitId', 'm_versionId'].includes(fieldId)) {
                    continue;
                } else {
                    if (joinedData[fieldId] === undefined) {
                        joinedData[fieldId] = {};
                    }
                    if (joinedData[fieldId][visitId] === undefined) {
                        joinedData[fieldId][visitId] = {
                            totalNumOfRecords: 0,
                            validNumOfRecords: 0,
                            data: []
                        };
                    }
                    if (data[subjectId][visitId][fieldId] !== '99999') {
                        joinedData[fieldId][visitId]['validNumOfRecords'] += 1;
                        // if summary mode; donot return data
                    }
                    if (format !== 'summary') {
                        joinedData[fieldId][visitId]['data'].push(data[subjectId][visitId][fieldId]);
                    }
                    joinedData[fieldId][visitId]['totalNumOfRecords'] += 1;
                }
            }
        }
    }
    return joinedData;
}
