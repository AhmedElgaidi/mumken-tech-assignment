/** Result of making sure one record has a live job. */
export enum EnsureJobResultEnum {
  /** A live job already existed. */
  EXISTS = "exists",
  /** No job existed; a new one was added. */
  ADDED = "added",
  /** A finished job was removed and a new one added. */
  RE_ADDED = "re-added",
  /** The job turned active while being replaced, so a worker already has it. */
  SKIPPED_ACTIVE = "skipped-active",
}
