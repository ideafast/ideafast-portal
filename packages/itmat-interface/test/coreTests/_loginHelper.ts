import * as mfa from '../../src/utils/mfa';
import { SuperTest, Test } from 'supertest';

export function connectAdmin(agent: SuperTest<Test>): Promise<void> {
    const adminSecret = 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA';
    return connectAgent(agent, 'admin', 'admin', adminSecret);
}

export function connectUser(agent: SuperTest<Test>): Promise<void> {
    const userSecret = 'H6BNKKO27DPLCATGEJAZNWQV4LWOTMRA';
    return connectAgent(agent, 'standardUser', 'admin', userSecret);
}

export function connectAgent(agent: SuperTest<Test>, user: string, pw: string, secret: string): Promise<void> {
    const otp = mfa.generateTOTP(secret).toString();
    return new Promise((resolve, reject) => agent.post('/trpc/user.login')
        .set('Content-type', 'application/json')
        .send({
            input: { username: user, password: pw, totp: otp, requestexpirydate: null }
        })
        .then(res => {
            if (res.status === 200)
                return resolve();
            return reject();
        }).catch(() => null));
}

export function disconnectAgent(agent: SuperTest<Test>): Promise<void> {
    return new Promise((resolve, reject) => agent.post('/graphql')
        // .send({
        //     query: print(LOGOUT)
        // })
        .then(res => {
            if (res.status === 200)
                return resolve();
            return reject();
        }).catch(() => null));
}
