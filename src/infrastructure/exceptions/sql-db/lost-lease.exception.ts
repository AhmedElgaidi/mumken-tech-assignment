/** Thrown inside a lease-guarded transaction when the lease moved on; rolls the write back. */
export class LostLeaseException extends Error {
  /** Error name shown in logs and in the stored attempt message. */
  public override readonly name = "LostLeaseException";
}
