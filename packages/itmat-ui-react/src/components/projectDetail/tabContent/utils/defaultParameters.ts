export const options: any = {
    ops: ['=', '!=', '<', '>', '>=', '<='],
    tagColors: {
        VISIT: 'red',
        RACE: 'volcano',
        GENDER: 'cyan',
        SITE: 'orange',
        filters: 'purple'
    }
};

export const statisticsTypes: string[] = [
    'ttest', 'ztest'
];

export const analysisTemplate: any = {
};

export const dataTypeMapping: any = {
    int: 'Integer',
    dec: 'Decimal',
    str: 'String',
    bool: 'Boolean',
    date: 'Datetime',
    file: 'File',
    json: 'JSON',
    cat: 'Categorical'
};
