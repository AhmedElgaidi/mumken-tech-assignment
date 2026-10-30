/** Outcome of a lease-guarded write. */
export enum LeaseWriteResultEnum {
  /** The write was committed. */
  SAVED = "saved",
  /** Another worker owns the record now; the write was rolled back. */
  LOST_LEASE = "lost-lease",
}
