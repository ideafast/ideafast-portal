export function encodeQueryParams(s: any): string {
    return encodeURIComponent(JSON.stringify(s));
}
