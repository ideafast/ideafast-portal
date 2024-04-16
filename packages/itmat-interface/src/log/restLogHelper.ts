import { v4 as uuid } from 'uuid';
import { db } from '../database/database';
import { ILog, enumAPIResolver, enumEventStatus, enumEventType } from '@itmat-broker/itmat-types';

// Middleware for logging REST API calls
export const logRESTAPICall = async (req:any, res:any, next:any) => {
    const startTime = Date.now();
    res.on('finish', async () => { // Use 'finish' event to capture when the response is fully sent
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        const logEntry: ILog = {
            id: uuid(),
            requester: req.user?.id ?? 'NA',
            type: enumEventType.API_LOG,
            apiResolver: enumAPIResolver.REST,
            event: req.path,
            parameters: JSON.stringify(req.query), // or req.body depending on your needs
            status: res.statusCode >= 400 ? enumEventStatus.FAIL : enumEventStatus.SUCCESS,
            errors: undefined, // Populate this based on your error handling logic
            timeConsumed: executionTime,
            life: {
                createdTime: Date.now(),
                createdUser: 'SYSTEMAGENT',
                deletedTime: null,
                deletedUser: null
            },
            metadata: {} // Add any additional metadata if necessary
        };

        // Insert the log entry into the database
        await db.collections!.log_collection.insertOne(logEntry);
    });
    next();
};
