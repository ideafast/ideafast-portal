import { ApolloError } from 'apollo-server-core';
import { errorCodes } from '../graphql/errors';
import { IUser } from 'itmat-commons';
import GraphQLJSON from 'graphql-type-json';

export const bounceNotLoggedInDecorator = (reducerFunction: any) => {
    return async (parent: any, args: any, context: any, info: any) => {
        const uncheckedFunctionWhitelist = ['login', 'rsaSigner', 'keyPairGenwSignature', 'issueAccessToken', 'whoAmI', 'getOrganisations', 'requestUsernameOrResetPassword', 'resetPassword', 'createUser', 'writeLog', 'validateResetPassword'];
        const requester: IUser = context.req.user;

        if (!requester) {
            if (!(uncheckedFunctionWhitelist as any).includes(reducerFunction.name)) {
                throw new ApolloError(errorCodes.NOT_LOGGED_IN);
            }
        }
        return await reducerFunction(parent, args, context, info);
    };
};

export function constructResolvers(modules: any) {
    const reduceInit: any = { JSON: GraphQLJSON };
    const resolvers = modules.reduce((a, e) => {
        const types = Object.keys(e);
        for (const each of types) {  // types can be Subscription | Query | Mutation | {{TYPE}}
            if (a[each] === undefined) {  // if a doesnt have types then create a empty obj
                a[each] = {};
            }
            for (const funcName of Object.keys((e as any)[each])) {
                if (each === 'Subscription') {
                    (a as any)[each][funcName] = (e as any)[each][funcName];
                } else {
                    (a as any)[each][funcName] = bounceNotLoggedInDecorator((e as any)[each][funcName]);
                }
            }
        }
        return a;
    }, reduceInit);
    return resolvers;
}
