// ts-jest's CommonJS resolver does not read the package's export map.
declare module 'graphql-ws/use/ws' {
    export { useServer } from 'graphql-ws/dist/use/ws';
}
