/**
 * A row's internal primary key (`bigint`). It joins rows inside the server and never leaves it:
 * repositories return the `publicId` UUID instead. pg returns `bigint` as a string, hence `string`.
 */
export type InternalIdType = string;
