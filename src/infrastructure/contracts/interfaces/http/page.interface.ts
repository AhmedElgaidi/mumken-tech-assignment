/** The list envelope shared by every paginated endpoint. */
export interface PageInterface<T> {
  /** The items of this page, in listing order. */
  data: T[];
  /** Opaque cursor for the next page, or `null` on the last page. */
  nextCursor: string | null;
}
