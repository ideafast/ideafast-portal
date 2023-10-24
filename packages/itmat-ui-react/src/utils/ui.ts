export function tableColumnRender(data, property) {
    if (property.type === 'string') {
        return data.properties[property.title] ?? 'NA';
    } else if (property.type === 'UNIX timestamps') {
        return (new Date(data.properties[property.title])).toUTCString();
    }
}