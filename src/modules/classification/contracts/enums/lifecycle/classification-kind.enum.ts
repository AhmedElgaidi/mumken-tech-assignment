/** Who produced a classification row. */
export enum ClassificationKindEnum {
  /** Written by the worker from the classifier result. */
  AUTOMATIC = "AUTOMATIC",
  /** A reviewer chose a different category; the earlier row stays. */
  MANUAL_CORRECTION = "MANUAL_CORRECTION",
  /** A reviewer accepted the automatic result as it is. */
  MANUAL_APPROVAL = "MANUAL_APPROVAL",
}
