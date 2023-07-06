import { enumEventOperation, enumEventType, enumEventStatus, enumUserTypes } from '@itmat-broker/itmat-types';
import { FetchResult } from '@apollo/client';

export function logFun(mutationFunc: (__unused__data: { variables: any }) => Promise<FetchResult<any>>, whoamidata: any, type: enumEventType, actionData: any, status: enumEventStatus) {
    if ('ERROR' in actionData) {
        actionData.ERROR = actionData.ERROR.graphQLErrors[0].message;
    }
    const logData = JSON.stringify(actionData);
    mutationFunc({
        variables: {
            requesterId: whoamidata ? whoamidata.whoAmI.id : 'NA',
            requesterName: whoamidata ? whoamidata.whoAmI.username : 'NA',
            requesterType: whoamidata ? whoamidata.whoAmI.type : enumUserTypes.STANDARD,
            action: type,
            actionData: logData,
            status: status
        }
    }
    );
}
