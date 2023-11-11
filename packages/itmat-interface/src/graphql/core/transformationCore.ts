import { IAST, IValueVerifier } from '@itmat-broker/itmat-types';
import { utilsCore } from './utilsCore';
import { it } from 'node:test';

type IDataTransformationClip = {
    [key: string]: any;
}
type IDataTransformationClipArray = IDataTransformationClip[];

type IDataTransformationType = IDataTransformationClip | IDataTransformationClipArray

abstract class DataTransformation {
    abstract transform(data: IDataTransformationType): IDataTransformationType
}

/**
 * Group data by keys.
 *
 * @input A[]
 * @OUTPUT A[][]
 *
 * @param keys - The keys to group by.
 * @param skipUnmatch - Whether to skip the ungrouped data.
 */
class tGrouping extends DataTransformation {
    protected keys: string[];
    protected skipUnmatch: boolean;

    constructor(params: { keys: string[], skipUnmatch: boolean }) {
        super();
        this.keys = params.keys;
        this.skipUnmatch = params.skipUnmatch;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        // Check input type
        if (!Array.isArray(data) || (data.length > 0 && Array.isArray(data[0]))) {
            throw new Error('Input data must be of type IDataTransformationClipArray (A[]) and not A[][]');
        }

        // We'll use a map to group the records. The key will be a string representation of the values of the keys.
        const groupsMap: Record<string, IDataTransformationClipArray> = {};
        const unmatched: IDataTransformationClipArray[] = []; // This will hold arrays
        for (const item of data) {
            // Check if all specified keys exist in the data item
            const allKeysExist = this.keys.every(key => this.getValueFromNestedKey(item, key) !== undefined);

            if (!allKeysExist) {
                if (this.skipUnmatch) {
                    continue; // skip this item
                } else {
                    unmatched.push([item]); // wrap the unmatched item in an array
                    continue;
                }
            }

            // For each record, we'll generate a key by concatenating the values of the specified keys
            const groupKey = this.keys.map(key => String(this.getValueFromNestedKey(item, key))).join('|');

            // If this group doesn't exist yet, we'll create it
            if (!groupsMap[groupKey]) {
                groupsMap[groupKey] = [];
            }

            // We'll add the current item to its group
            groupsMap[groupKey].push(item);
        }

        // Now, combine matched groups and unmatched items
        const result: IDataTransformationClipArray[] = [...Object.values(groupsMap), ...unmatched];
        return result;
    }

    getValueFromNestedKey(obj: any, key: string): any {
        const keys = key.split('.');
        let current = obj;

        for (const k of keys) {
            if (current[k] !== undefined) {
                current = current[k];
            } else {
                return undefined;
            }
        }

        return current;
    }
}

/**
 * Convert or delete each value of the data. Note, by default, the execution order is: adding keys -> affine -> remove keys
 *
 * @input A[]
 * @output A[]
 *
 * @param removedKeys - Keys to remove.
 * @param addedKeyRules - Keys to add.
 * @param rules - Rules to conver the values.
 */
class tAffine extends DataTransformation {
    protected removedKeys: string[];
    protected addedKeyRules: Array<{ key: IAST, value: IAST }>;
    protected rules: Record<string, IAST>;

    constructor(params: { removedKeys: string[], rules: Record<string, IAST>, addedKeyRules: Array<{ key: IAST, value: IAST }> }) {
        super();
        this.removedKeys = params.removedKeys;
        this.addedKeyRules = params.addedKeyRules;
        this.rules = params.rules;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (!Array.isArray(data) || (data.length > 0 && Array.isArray(data[0]))) {
            throw new Error('Input data must be of type IDataTransformationClipArray (A[]) and not A[][]');
        }

        const affinedData: any[] = [];
        for (const item of data) {
            // add keys
            for (const pair of this.addedKeyRules) {
                item[utilsCore.IASTHelper(pair.key, item)] = utilsCore.IASTHelper(pair.value, item);
            }
            for (const key of Object.keys(item)) {
                // affine
                if (this.rules[key]) {
                    item[key] = utilsCore.IASTHelper(this.rules[key], item[key]);
                }
            }
            for (const key of Object.keys(item)) {
                // remove keys
                if (this.removedKeys.includes(key)) {
                    delete item[key];
                }
            }
            Object.keys(item).length > 0 && affinedData.push(item);
        }
        return affinedData;
    }
}

/**
 * Leave one data from a group.
 *
 * @input A[][]
 * @output A[]
 *
 * @param scoreFormula - The formula to give rank of the data.
 * @param isDescend - Whether to rank in descend order.
 */
class tLeaveOne extends DataTransformation {
    protected scoreFormula: IAST;
    protected isDescend: boolean;

    constructor(params: { scoreFormula: IAST, isDescend: boolean }) {
        super();
        this.scoreFormula = params.scoreFormula;
        this.isDescend = params.isDescend;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (!Array.isArray(data) || (data.length > 0 && !Array.isArray(data[0]))) {
            throw new Error('Input data must be of type A[][] (array of arrays) and not A[]');
        }
        const mergedData: any[] = [];
        for (const items of data) {
            const scores: number[] = [];
            for (let i = 0; i < items.length; i++) {
                scores.push(utilsCore.IASTHelper(this.scoreFormula, items[i]));
            }
            const index = this.isDescend ? scores.indexOf(Math.max(...scores)) : scores.indexOf(Math.min(...scores));
            mergedData.push(items[index]);
        }
        return mergedData;
    }
}

/**
 * Join data within a group.
 * Note usually you should use that after a grouping, this function will not check if the values of the keys are the same.
 * @input A[][]
 * @output A[]
 *
 * @param reservedKeys - Keys to join on.
 */
class tJoin extends DataTransformation {
    protected reservedKeys: string[];

    constructor(params: { reservedKeys: string[] }) {
        super();
        this.reservedKeys = params.reservedKeys;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (!Array.isArray(data) || (data.length > 0 && !Array.isArray(data[0]))) {
            throw new Error('Input data must be of type A[][] (array of arrays) and not A[]');
        }

        const joinedData: any[] = [];
        for (const items of data) {
            let obj = {};
            for (let i = 0; i < items.length; i++) {
                obj = {
                    ...obj,
                    ...items[i]
                };
            }
            joinedData.push(obj);
        }
        return joinedData;
    }
}

/**
 * Concat values into an array.
 *
 * @input A[][]
 * @output A[]
 */
class tConcat extends DataTransformation {
    protected concatKeys: string[];

    constructor(params: { concatKeys: string[] }) {
        super();
        this.concatKeys = params.concatKeys;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (!Array.isArray(data) || (data.length > 0 && !Array.isArray(data[0]))) {
            throw new Error('Input data must be of type A[][] (array of arrays) and not A[]');
        }
        const results: IDataTransformationClip[] = [];
        data.forEach(array => {
            const result: any = {};

            array.forEach((item: any) => {
                Object.keys(item).forEach(key => {
                    if (this.concatKeys.includes(key)) {
                        if (!result[key]) {
                            result[key] = [];
                        }
                        result[key].push(item[key]);
                    } else {
                        if (!result[key]) {
                            result[key] = item[key];
                        }
                    }
                });
            });
            results.push(result);
        });

        return results;
    }
}

/**
 * Deconcat values into an array.
 *
 * @input A[]
 * @output A[][]
 */
class tDeconcat extends DataTransformation {
    protected deconcatKeys: string[];
    protected matchMode: 'combinations' | 'sequential';

    constructor(params: { deconcatKeys: string[], matchMode?: 'combinations' | 'sequential' }) {
        super();
        this.deconcatKeys = params.deconcatKeys;
        this.matchMode = params.matchMode || 'combinations'; // default to "combinations"
    }

    private cartesianProduct(arr: any[][]): any[][] {
        return arr.reduce((a: any[][], b: any[]): any[][] => {
            return a.flatMap((x: any[]): any[][] =>
                b.map((y: any): any[] => x.concat([y]))
            );
        }, [[]]);
    }

    transform(data: IDataTransformationClipArray): IDataTransformationClipArray[] {
        const results: IDataTransformationClipArray[] = [];

        data.forEach((item: IDataTransformationClip) => {
            const subResults: IDataTransformationClip[] = [];

            if (this.matchMode === 'combinations') {
                // Extract arrays for keys to deconcatenate
                const arraysToDeconcat: any[][] = this.deconcatKeys.map(key => item[key] || []);

                const product = this.cartesianProduct(arraysToDeconcat);

                product.forEach(combination => {
                    const newObj = this.createDeconcatObject(item, combination);
                    subResults.push(newObj);
                });
            } else if (this.matchMode === 'sequential') {
                // Get the max length of arrays for sequential match
                const maxLength = Math.max(...this.deconcatKeys.map(key => (item[key] as any[])?.length || 0));

                for (let i = 0; i < maxLength; i++) {
                    const sequentialValues = this.deconcatKeys.map(key => item[key]?.[i]);
                    const newObj = this.createDeconcatObject(item, sequentialValues);
                    subResults.push(newObj);
                }
            }

            results.push(subResults);
        });

        return results;
    }

    private createDeconcatObject(item: IDataTransformationClip, values: any[]): IDataTransformationClip {
        const newObj: IDataTransformationClip = {};

        // For each key, if it's a deconcat key, use value from provided values; otherwise copy as-is
        this.deconcatKeys.forEach((key, index) => {
            newObj[key] = values[index];
        });

        // Copy other keys as they are
        Object.keys(item).forEach((key: string) => {
            if (!this.deconcatKeys.includes(key)) {
                newObj[key] = item[key];
            }
        });

        return newObj;
    }
}

/**
 * Filter the data.
 *
 * @input A[] | A[][]
 * @output A[] | A[][]
 */
class tFilter extends DataTransformation {
    protected filters: Record<string, IValueVerifier>;

    constructor(params: { filters: Record<string, IValueVerifier> }) {
        super();
        this.filters = params.filters;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (Array.isArray(data) && data.length && Array.isArray(data[0])) {
            // Input is A[][]
            return (data as IDataTransformationClip[][]).map(subArray =>
                subArray.filter(item => this.isValidItem(item))
            );
        } else {
            // Input is A[]
            return (data as IDataTransformationClip[]).filter(item => this.isValidItem(item));
        }
    }

    private isValidItem(data: IDataTransformationType): boolean {
        return Object.keys(this.filters).every(key => {
            return utilsCore.validValueWithVerifier(data, this.filters[key]);
        });
    }
}

/**
 * Split a data into multiple data.
 *
 * @input A[]
 * @output A[][]
 *
 * @param sharedKeys - The kyes to kept in the new data.
 * @param targetKeyGroups - The keys to add with the shared keys.
 */
class tDegroup extends DataTransformation {
    protected sharedKeys: string[];
    protected targetKeyGroups: string[][];

    constructor(params: { sharedKeys: string[], targetKeyGroups: string[][] }) {
        super();
        this.sharedKeys = params.sharedKeys;
        this.targetKeyGroups = params.targetKeyGroups;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (!Array.isArray(data) || (data.length > 0 && Array.isArray(data[0]))) {
            throw new Error('Input data must be of type IDataTransformationClipArray (A[]) and not A[][]');
        }

        const splitData: any[] = [];
        for (const item of data) {
            const saved: any[] = [];
            for (let i = 0; i < this.targetKeyGroups.length; i++) {
                const obj: any = {};
                for (let j = 0; j < this.sharedKeys.length; j++) {
                    obj[this.sharedKeys[j]] = item[this.sharedKeys[j]];
                }
                for (let j = 0; j < this.targetKeyGroups[i].length; j++) {
                    obj[this.targetKeyGroups[i][j]] = item[this.targetKeyGroups[i][j]];
                }
                saved.push(obj);
            }
            splitData.push(saved);
        }
        return splitData;
    }
}
/**
 * Flatten an object. Keys within the object will be keys in the data clip.
 *
 * @input A[] | A[][]
 * @output A[] | A[][]
 *
 * @param keepFlattened - Whether to keep the values from the object if conflicts.
 * @param flattenedKey - The key to flatten.
 * @param keepFlattenedKey - Whether to keep the flattened key.
 */
class tFlatten extends DataTransformation {
    protected keepFlattened: boolean;
    protected flattenedKey: string;
    protected keepFlattenedKey: boolean;

    constructor(params: { keepFlattened: boolean, flattenedKey: string, keepFlattenedKey: boolean }) {
        super();
        this.keepFlattened = params.keepFlattened;
        this.flattenedKey = params.flattenedKey;
        this.keepFlattenedKey = params.keepFlattenedKey;
    }

    transform(data: IDataTransformationType): IDataTransformationType {
        if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
            // Handle A[][] type input
            return data.map(group => group.map((item: IDataTransformationClip) => this.flattenItem(item)));
        } else if (Array.isArray(data)) {
            // Handle A[] type input
            return data.map(item => this.flattenItem(item));
        } else {
            throw new Error('Invalid input format for tFlatten transform.');
        }
    }

    private flattenItem(item: IDataTransformationClip): IDataTransformationClip {
        const objectToFlatten = item[this.flattenedKey];
        if (typeof objectToFlatten !== 'object' || objectToFlatten === null) {
            return item; // If the key does not correspond to an object or is null, return the item unchanged
        }

        const flattenedItem: IDataTransformationClip = { ...item };
        for (const key in objectToFlatten) {
            // If there's a conflict and keepFlattened is true, the original value in the item will be overridden
            if (!this.keepFlattened || !(key in item)) {
                flattenedItem[key] = objectToFlatten[key];
            }
        }

        // If keepFlattenedKey is false, remove the original key from the flattened item
        if (!this.keepFlattenedKey) {
            delete flattenedItem[this.flattenedKey];
        }

        return flattenedItem;
    }
}


type DataTransformationConstructor = new (...args: any[]) => DataTransformation;

export class DataTransformationCore {
    public transformationRegistry: Record<string, DataTransformationConstructor> = {
        Group: tGrouping,
        Affine: tAffine,
        LeaveOne: tLeaveOne,
        Concat: tConcat,
        Deconcat: tDeconcat,
        Join: tJoin,
        Degroup: tDegroup,
        Filter: tFilter,
        Flatten: tFlatten
    };

    public transformationCompose(data: IDataTransformationClip, transformations: Array<{ operationName: string, params: any }>): IDataTransformationType {
        return transformations.reduce((currentData, transformation) => {
            // Get the class constructor from the registry using the operation name
            const TransformationClass = this.transformationRegistry[transformation.operationName];

            // Ensure that the transformation exists in the registry
            if (!TransformationClass) {
                throw new Error(`Transformation ${transformation.operationName} is not registered.`);
            }

            // Create an instance of the class using the provided parameters
            const instance = new TransformationClass(transformation.params);

            // Call the transform method of the instance on the current data
            return instance.transform(currentData);
        }, data);
    }

    public transformationAggregate(data: IDataTransformationClip, transformationsAgg: Record<string, Array<{ operationName: string, params: any }>>): Record<string, IDataTransformationType> {
        if (!transformationsAgg || Object.keys(transformationsAgg).length === 0) {
            return data;
        }
        const aggregation: any = {};
        for (const key of Object.keys(transformationsAgg)) {
            aggregation[key] = this.transformationCompose(data, transformationsAgg[key]);
        }
        return aggregation;
    }
}


export const dataTransformationCore = Object.freeze(new DataTransformationCore());


/**
 * Examples of data transformation
 1. Generate a simplified version of data:
  {
  "aggregation": {
    "device": [
      {
        "params": {
          "keys": [
            "properties.Device Type",
            "properties.Participant ID",
            "properties.Device ID",
            "properties.End Date",
            "properties.Start Date"
          ],
          "skipUnmatch": true
        },
        "operationName": "Group"
      },
      {
        "params": {
          "scoreFormula": {
            "operator": null,
            "type": "VARIABLE",
            "value": "life.createdTime",
            "children": null,
            "parameters": {}
          },
          "isDescend": true
        },
        "operationName": "LeaveOne"
      },
      {
        "operationName": "Filter",
        "params": {
          "filters": {
            "deleted": {
              "formula": {
                "value": "life.deletedTime",
                "operation": null,
                "type": "VARIABLE",
                "parameter": {},
                "children": null
              },
              "value": "",
              "condition": "general:=null",
              "parameters": {}
            }
          }
        }
      },
      {
        "operationName": "Affine",
        "params": {
          "removedKeys": [
            "_id",
            "id",
            "studyId",
            "dataVersion",
            "life",
            "metadata"
          ],
          "addedKeyRules": [],
          "rules": {}
        }
      }
    ],
    "clinical": [
      {
        "operationName": "Group",
        "params": {
          "keys": [
            "properties.Visit ID",
            "properties.Participant ID",
            "fieldId"
          ],
          "skipUnmatch": true
        }
      },
      {
        "operationName": "LeaveOne",
        "params": {
          "scoreFormula": {
            "operator": null,
            "children": null,
            "type": "VARIABLE",
            "value": "life.createdTime",
            "parameters": {}
          },
          "isDescend": true
        }
      },
      {
        "params": {
          "filters": {
            "deleted": {
              "parameters": {},
              "value": "",
              "condition": "general:=null",
              "formula": {
                "parameter": {},
                "value": "life.deletedTime",
                "operation": null,
                "children": null,
                "type": "VARIABLE"
              }
            }
          }
        },
        "operationName": "Filter"
      },
      {
        "operationName": "Affine",
        "params": {
          "removedKeys": [
            "_id",
            "id",
            "studyId",
            "dataVersion",
            "life",
            "metadata"
          ],
          "addedKeyRules": [],
          "rules": {}
        }
      },
      {
        "operationName": "Flatten",
        "params": {
          "keepFlattened": true,
          "flattenedKey": "properties",
          "keepFlattenedKey": false
        }
      },
      {
        "operationName": "Affine",
        "params": {
          "removedKeys": [
            "fieldId",
            "value"
          ],
          "addedKeyRules": [
            {
              "key": {
                "type": "VARIABLE",
                "operator": null,
                "value": "fieldId",
                "parameters": {},
                "children": null
              },
              "value": {
                "type": "VARIABLE",
                "operator": null,
                "value": "value",
                "parameters": {},
                "children": null
              }
            }
          ],
          "rules": {}
        }
      },
      {
        "operationName": "Group",
        "params": {
          "keys": [
            "Participant ID",
            "Visit ID"
          ],
          "skipUnMatch": false
        }
      },
      {
        "operationName": "Join",
        "params": {
          "reservedKeys": [
            "Participant ID",
            "Visit ID"
          ]
        }
      }
    ]
  },
  "useCache": false,
  "studyId": "96f17282-e0a3-43d3-8f38-326949b786ef",
  "versionId": null,
  "forceUpdate": false
}

 2. Generate data standardization pipeline:

 */