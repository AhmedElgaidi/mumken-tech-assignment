/** A failure that will fail again on the same input; retried only on explicit request. */
export class PermanentClassificationException extends Error {
  /** Error name shown in logs and in the stored attempt message. */
  public override readonly name = "PermanentClassificationException";
}
