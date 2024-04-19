import { IBase } from './base';

export interface IDomain extends IBase {
    domainPath: string;
    name: string;
    logo?: string;
    color?: string;
}