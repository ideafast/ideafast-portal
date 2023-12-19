export interface UserID {
    id: string;
    username: string;
}

export const printDebug = (
    elem: Element | null,
    message: string,
    data: string
): void => {
    if (elem) {
        elem.innerHTML = `<b>${message}:</b><pre>${data}</pre>`;
    }
};

export const removeTypenameDeep = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    const newObj = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        if (key === '__typename') {
            continue;
        }
        newObj[key] = removeTypenameDeep(obj[key]);
    }

    return newObj;
};


