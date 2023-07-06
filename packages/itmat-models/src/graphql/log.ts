import gql from 'graphql-tag';

// export const GET_LOGS = gql`
//     query getLogs(
//         $requesterId: [String],
//         $userAgent: [enumUserAgent],
//         $type: [enumEventType],
//         $operationName: [enumEventOperation],
//         $status: [enumEventStatus],
//         $startIndex: Int
//         $endIndex: Int
//     ) {
//         getLogs (
//             requesterId: $requesterId,
//             userAgent: $userAgent,
//             type: $type,
//             operationName: $operationName,
//             status: $status,
//             startIndex: $startIndex,
//             endIndex: $endIndex
//         ) {
//             requesterId
//             userAgent
//             type
//             operationName
//             parameters
//             status
//             errors
//         }
//     }
// `;
