export const demographicsFields: any = {
    race: '1725',
    age: '3321',
    genderID: '566',
    siteID: '569',
    visit: '0'
};

export const domains = {
    LB: 'Laboratory Test',
    FT: 'Function Test',
    VS: 'Vital Sign',
    QS: 'Questionnaires'
};

export const options: any = {
    ops: ['=', '!=', '<', '>', '>=', '<='],
    tagColors: {
        visit: 'red',
        race: 'volcano',
        genderID: 'cyan',
        siteID: 'orange',
        mh: 'blue',
        cm: 'lime',
        filters: 'purple'
    }
};

export const guidelinesOfAnalysis: string[] = [
    '1. Create groups based on several criteria. These criteria include demographics (age, race, sex, etc.), ' +
    'and general variables that can be filtered by a range;',
    '2. Click the Analysis button to do an analysis;',
    '3. View the analytical results. Users can select on of the two statistics (T test, Z test), and ' +
    'download the original data of the results.'
];

export const statisticsTypes: string[] = [
    'ttest', 'ztest', 'utest'
];

export const analysisTemplate: any = {
    compareBySex: {
        description: 'Group subjects by their sexes.',
        groups: [
            {
                visit: '2',
                genderID: [
                    '1'
                ],
                race: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: []
            },
            {
                visit: '2',
                genderID: [
                    '2'
                ],
                race: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: []
            }
        ],
        comparedFields: ['1781', '1789']
    },
    compareByHeartRate: {
        description: 'Group subjects by their heart rates.',
        groups: [
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '<', value: 50
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: '50'
                },{
                    field: '3075', op: '<', value: '60'
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: '60'
                },{
                    field: '3075', op: '<', value: '70'
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: '70'
                },{
                    field: '3075', op: '<', value: '80'
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: '80'
                },{
                    field: '3075', op: '<', value: '90'
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: '90'
                },{
                    field: '3075', op: '<', value: '100'
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: [],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: '100'
                }]
            },
        ],
        comparedFields: []
    },
    compareSexHeartRate: {
        description: 'Group subjects by their heart rates and sexes.',
        groups: [
            {
                visit: '2',
                race: [],
                genderID: ['1'],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '<', value: 80
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: ['2'],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '<', value: 80
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: ['1'],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: 80
                }]
            },
            {
                visit: '2',
                race: [],
                genderID: ['2'],
                siteID: [],
                age: [0, 100],
                mh: [],
                filters: [{
                    field: '3075', op: '>=', value: 80
                }]
            },
        ],
        comparedFields: ['1783', '1784']
    }
};
