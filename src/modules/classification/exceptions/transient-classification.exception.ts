/** A failure that may succeed if tried again (timeouts, provider overload, network). */
export class TransientClassificationException extends Error {
  /** Error name shown in logs and in the stored attempt message. */
  public override readonly name = "TransientClassificationException";
}
