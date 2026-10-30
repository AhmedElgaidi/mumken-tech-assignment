/** Size limits of one import request. */
export interface ImportSettingsInterface {
  /** Records one import may carry. */
  maxRecords: number;
  /** Largest request body, in the `body-parser` size format (for example `10mb`). */
  maxBodyBytes: string;
}
