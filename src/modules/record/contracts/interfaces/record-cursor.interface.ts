/** The position a record page continues after. */
export interface RecordCursorInterface {
  /** Date of the last record of the previous page. */
  recordDate: Date;
  /** Id of the last record of the previous page; breaks a date tie. */
  id: string;
}
