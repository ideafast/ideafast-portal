// eslint:disable: no-console
import { Express } from 'express';
import { Socket } from 'net';
import http from 'http';
import https from 'https';
import ITMATInterfaceRunner from './interfaceRunner';
import config from './utils/configManager';
import { db } from './database/database';
import { IUser, userTypes } from '@itmat-broker/itmat-types';
import { mailer } from './emailer/emailer';


let interfaceRunner = new ITMATInterfaceRunner(config);
let interfaceSockets: Socket[] = [];
let interfaceServer: http.Server;
let interfaceHttpsServer: https.Server;
let interfaceRouter: Express;

function serverStart() {
    console.info(`Starting api server ${process.pid} ...`);
    interfaceRunner.start().then(async (itmatRouter) => {

        interfaceServer = itmatRouter.getServer();

        interfaceHttpsServer = itmatRouter.getHttpsServer(); // Add a method in your Router class to get the HTTPS server

        // interfaceServer.timeout = 0;
        // interfaceServer.headersTimeout = 0;
        // interfaceServer.requestTimeout = 0;

        //TODO temporary extend the time

        interfaceServer.timeout = 120000;
        interfaceServer.headersTimeout = 125000;
        interfaceServer.requestTimeout = 130000;

        interfaceServer.keepAliveTimeout = 1000 * 60 * 60 * 24 * 5;
        interfaceServer.listen(config.server.port, () => {
            console.info(`Listening at http://localhost:${config.server.port}/`);
        })
            .on('connection', (socket) => {
                socket.setKeepAlive(true);
                socket.setNoDelay(true);
                socket.setTimeout(0);
                (socket as any).timeout = 0;
                interfaceSockets.push(socket);
            })
            .on('error', (error) => {
                if (error) {
                    console.error('An error occurred while starting the HTTP server.', error);
                    return;
                }
            });

        // TODO local test wjf
        // Set timeouts and other configurations for the HTTPS server
        interfaceHttpsServer.timeout = 120000; // 2 minutes in milliseconds
        interfaceHttpsServer.headersTimeout = 125000; // Slightly longer than 'timeout'
        interfaceHttpsServer.keepAliveTimeout = 75000; // Adjust as needed

        // Start the HTTPS server
        interfaceHttpsServer.listen('3443', () => {
            console.info('HTTPS Server listening at https://localhost:3443/');
        }).on('connection', (/*socket*/) => {
            // You might want to apply similar socket configurations as with the HTTP server
            console.log('On connection for https');
            // try {
            //     if (socket) {
            //         socket.setKeepAlive(true);
            //         socket.setNoDelay(true);
            //         socket.setTimeout(0);
            //     } else {
            //         console.error('Received undefined socket object in connection event.');
            //     }
            // } catch (error) {
            //     console.error('An error occurred in the connection event:', error);
            // }
        }).on('error', (error) => {
            console.error('An error occurred while starting the HTTPS server.', error);
        });
        // notice users of expiration
        await emailNotification();

        // const interfaceRouterProxy = itmatRouter.getProxy();
        // if (interfaceRouterProxy?.upgrade)
        //     interfaceServer.on('upgrade', interfaceRouterProxy?.upgrade);

    }).catch((error) => {
        console.error('An error occurred while starting the ITMAT core.', error);
        if (error.stack)
            console.error(error.stack);
        setTimeout(serverStart, 5000);
        return false;
    });
}

function serverSpinning() {

    if (interfaceRouter !== undefined) {
        console.info('Renewing api server ...');
        interfaceRunner = new ITMATInterfaceRunner(config);
        console.info(`Destroying ${interfaceSockets.length} sockets ...`);
        interfaceSockets.forEach((socket) => {
            socket.destroy();
        });
        interfaceSockets = [];
        interfaceServer.close(() => {
            console.info(`Shuting down api server ${process.pid} ...`);
            interfaceRouter?.on('close', () => {
                serverStart();
            }) || serverStart();
        });
    } else {
        serverStart();
    }
}

serverSpinning();

declare const module: any;
if (module.hot) {
    module.hot.accept('./index', serverSpinning);
    module.hot.accept('./interfaceRunner', serverSpinning);
    module.hot.accept('./index.ts', serverSpinning);
    module.hot.accept('./interfaceRunner.ts', serverSpinning);
}

async function emailNotification() {
    const now = Date.now().valueOf();
    const threshold = now + 7 * 24 * 60 * 60 * 1000;
    // update info if not set before
    await db.collections!.users_collection.updateMany({ deleted: null, emailNotificationsStatus: null }, {
        $set: { emailNotificationsStatus: { expiringNotification: false } }
    });
    const users = await db.collections!.users_collection.find<IUser>({
        'expiredAt': {
            $lte: threshold,
            $gt: now
        },
        'type': { $ne: userTypes.ADMIN },
        'emailNotificationsActivated': true,
        'emailNotificationsStatus.expiringNotification': false,
        'deleted': null
    }).toArray();
    for (const user of users) {
        await mailer.sendMail({
            from: `${config.appName} <${config.nodemailer.auth.user}>`,
            to: user.email,
            subject: `[${config.appName}] Account is going to expire!`,
            html: `
                <p>
                    Dear ${user.firstname},
                <p>
                <p>
                    Your account will expire at ${new Date(user.expiredAt).toDateString()}.
                    You can make a request on the login page at ${config.appName}.
                </p>

                <br/>
                <p>
                    The ${config.appName} Team.
                </p>
            `
        });
        await db.collections!.users_collection.findOneAndUpdate({ id: user.id }, {
            $set: { emailNotificationsStatus: { expiringNotification: true } }
        });
    }
    setInterval(emailNotification, 24 * 60 * 60 * 1000);
}
