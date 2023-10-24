import { db } from '../../database/database';
import { GraphQLError } from 'graphql';
import { IOrganisation, IGenericResponse, ILog, enumUserAgent, enumEventType, enumAPIResolver, enumEventStatus } from '@itmat-broker/itmat-types';
import { makeGenericReponse } from '../responses';
import { v4 as uuid } from 'uuid';
import { errorCodes } from '../errors';

export class LogCore {
    public async getLogs(caller: string | null, type: enumEventType[] | null, apiResolver: enumAPIResolver[] | null, event: string[] | null, status: enumEventStatus[] | null, indexRange: number[] | null, timeRange: number[] | null): Promise<ILog[]> {
        /**
         * Get logs.
         *
         * @param caller - The caller of the event.
         * @param type - The type of the event.
         * @param apiResolver - The resolver of the event.
         * @param event - The event.
         * @param status - The status of the event.
         * @param indexRange - The range of the indexes.
         * @param timeRange - The range of the time.
         * Note that if parameters set to null, no restrictions will be applied.
         *
         * @return ILog[]
         */

        const filters: any = {};
        if (caller) {
            filters.requester = caller;
        }
        if (type) {
            filters.type = { $in: type };
        }
        if (apiResolver) {
            filters.apiResolver = { $in: apiResolver };
        }
        if (event) {
            filters.event = { $in: event };
        }
        if (status) {
            filters.status = { $in: status };
        }
        let logs;
        if (indexRange) {
            logs = await db.collections!.log_collection.find(filters).skip(indexRange[0]).limit(indexRange[1] - indexRange[0]).toArray();
        } else if (timeRange) {
            logs = await db.collections!.log_collection.find({
                'life.createdTime': {
                    $gte: timeRange[0],
                    $lte: timeRange[1]
                }
            }).toArray();
        } else {
            logs = await db.collections!.log_collection.find(filters).toArray();
        }
        return logs;
    }

    public async getLogsSummary(): Promise<Record<string, any>> {
        /**
         * Provide several statistics of the logs.
         *
         */
        const oneWeekInMilliseconds = 7 * 24 * 60 * 60 * 1000;
        const startTime = Date.now() - oneWeekInMilliseconds;
        const eventStatistics = await db.collections!.log_collection.aggregate([
            {
                $match: {
                    'life.createdTime': { $gte: startTime }
                }
            },
            {
                $addFields: {
                    hourIndex: {
                        $trunc: {
                            $divide: [
                                { $subtract: ['$life.createdTime', startTime] },
                                3600000
                            ]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: { event: '$event', hourIndex: '$hourIndex' },
                    countPerHour: { $sum: 1 },
                    avgTimeConsumed: { $avg: '$timeConsumed' },
                    stdDevTimeConsumed: { $stdDevSamp: '$timeConsumed' }
                }
            },
            {
                $group: {
                    _id: '$_id.event',
                    totalEventCount: { $sum: '$countPerHour' },
                    data: {
                        $push: {
                            hourIndex: '$_id.hourIndex',
                            count: '$countPerHour'
                        }
                    },
                    avgTimeConsumed: { $avg: '$avgTimeConsumed' },
                    stdDevTimeConsumed: { $avg: '$stdDevTimeConsumed' }
                }
            },
            {
                $project: {
                    _id: 0,
                    event: '$_id',
                    count: '$totalEventCount',
                    hourlyCounts: {
                        $map: {
                            input: { $range: [0, 168] },
                            as: 'hourIndex',
                            in: {
                                $let: {
                                    vars: {
                                        matchingHourData: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$data',
                                                        as: 'd',
                                                        cond: { $eq: ['$$d.hourIndex', '$$hourIndex'] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    },
                                    in: {
                                        hourIndex: '$$hourIndex',
                                        count: { $ifNull: ['$$matchingHourData.count', 0] }
                                    }
                                }
                            }
                        }
                    },
                    avgTimeConsumed: 1,
                    stdDevTimeConsumed: 1
                }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();
        const requesterStatistics = await db.collections!.log_collection.aggregate([
            {
                $match: {
                    'life.createdTime': { $gte: startTime }
                }
            },
            {
                $addFields: {
                    hourIndex: {
                        $trunc: {
                            $divide: [
                                { $subtract: ['$life.createdTime', startTime] },
                                3600000
                            ]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: { requester: '$requester', hourIndex: '$hourIndex' },
                    countPerHour: { $sum: 1 },
                    avgTimeConsumed: { $avg: '$timeConsumed' },
                    stdDevTimeConsumed: { $stdDevSamp: '$timeConsumed' }
                }
            },
            {
                $group: {
                    _id: '$_id.requester',
                    totalRequesterCount: { $sum: '$countPerHour' },
                    data: {
                        $push: {
                            hourIndex: '$_id.hourIndex',
                            count: '$countPerHour'
                        }
                    },
                    avgTimeConsumed: { $avg: '$avgTimeConsumed' },
                    stdDevTimeConsumed: { $avg: '$stdDevTimeConsumed' }
                }
            },
            {
                $project: {
                    _id: 0,
                    requester: '$_id',
                    count: '$totalRequesterCount',
                    hourlyCounts: {
                        $map: {
                            input: { $range: [0, 168] },
                            as: 'hourIndex',
                            in: {
                                $let: {
                                    vars: {
                                        matchingHourData: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: '$data',
                                                        as: 'd',
                                                        cond: { $eq: ['$$d.hourIndex', '$$hourIndex'] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    },
                                    in: {
                                        hourIndex: '$$hourIndex',
                                        count: { $ifNull: ['$$matchingHourData.count', 0] }
                                    }
                                }
                            }
                        }
                    },
                    avgTimeConsumed: 1,
                    stdDevTimeConsumed: 1
                }
            },
            {
                $sort: { count: -1 }
            }
        ]).toArray();

        return { eventStatistics: eventStatistics, requesterStatistics: requesterStatistics };
    }


}

export const logCore = Object.freeze(new LogCore());
