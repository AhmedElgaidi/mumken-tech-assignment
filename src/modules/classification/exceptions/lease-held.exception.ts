/** Another worker holds a valid lease on the record; BullMQ retries the job later. */
export class LeaseHeldException extends Error {
  /** Error name shown in logs and in the stored attempt message. */
  public override readonly name = "LeaseHeldException";
}
