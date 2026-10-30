/** Env values arrive as strings; numeric ones are converted before validation (empty stays empty). */
export class ToNumberTransform {
  /**
   * Converts a non-blank string to a number for `class-transformer`.
   *
   * @param params - The transform payload; only `value`, the raw environment value, is read.
   * @returns The number for a non-blank string, otherwise `value` unchanged so validation reports it.
   */
  public static apply({ value }: { value: unknown }): unknown {
    return typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  }
}
