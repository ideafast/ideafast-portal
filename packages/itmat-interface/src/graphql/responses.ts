import { IGenericResponse } from '@itmat-broker/itmat-types';

export function makeGenericReponse(id?: string, successful?: boolean, code?: string, description?: string): IGenericResponse {
    const res: IGenericResponse = {
        id: id ?? undefined,
        successful: successful ?? true,
        code: code ?? undefined,
        description: description ?? undefined
    };
    return res;
}
