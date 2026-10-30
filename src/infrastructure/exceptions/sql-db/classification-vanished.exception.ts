/** Thrown when the automatic classification just inserted or found cannot be read back. */
export class ClassificationVanishedException extends Error {
  /** Error name shown in logs. */
  public override readonly name = "ClassificationVanishedException";

  public constructor(recordId: string) {
    super(`automatic classification of ${recordId} vanished`);
  }
}
