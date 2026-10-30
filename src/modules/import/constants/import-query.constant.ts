/** Import items returned per page when the caller sends no `limit`. */
export const DEFAULT_IMPORT_ITEM_PAGE_SIZE = 50;

/** Largest `limit` a caller may ask for on the import items list. */
export const MAX_IMPORT_ITEM_PAGE_SIZE = 100;

/** Largest item index a cursor may carry: the Postgres `int` limit, so a crafted cursor cannot overflow the query. */
export const MAX_ITEM_CURSOR_INDEX = 2147483647;
