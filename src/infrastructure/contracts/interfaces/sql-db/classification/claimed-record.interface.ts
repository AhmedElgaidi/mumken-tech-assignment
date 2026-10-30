import { RecordStatusEnum } from "../../../../../modules/classification/contracts/enums/lifecycle/record-status.enum";

/** The record as the worker sees it right after a successful claim. */
export interface ClaimedRecordInterface {
  /** Public id of the record. */
  id: string;
  /** Headline to classify. */
  title: string;
  /** Body text to classify. */
  description: string;
  /** Source system name. */
  source: string;
  /** Publication or effective date. */
  recordDate: Date;
  /** Attempts made in the current retry generation, including this one. */
  attemptCount: number;
  /** The record's retry generation. */
  retryGeneration: number;
  /** Token proving this worker holds the lease. */
  leaseToken: string;
}

/** What the worker needs to know about a record before it starts or after a failure. */
export interface RecordWorkStateInterface {
  /** Public id of the record. */
  id: string;
  /** Current classification status. */
  status: RecordStatusEnum;
  /** Attempts made in the current retry generation. */
  attemptCount: number;
  /** Whether the record's lease is still live. */
  isLeaseValid: boolean;
}

/** The classifier's verdict, ready to be stored. */
export interface AutomaticResultInterface {
  /** Chosen category code. */
  categoryCode: string;
  /** Confidence from 0 to 1. */
  confidence: number;
  /** Whether the result is too uncertain to trust without review. */
  isReviewNeeded: boolean;
  /** Name and version of the classifier. */
  classifier: string;
  /** The classifier response as received. */
  rawOutput: unknown;
}

/** A record the sweeper must look at. */
export interface StuckRecordInterface {
  /** Public id of the record. */
  id: string;
  /** Current classification status. */
  status: RecordStatusEnum;
  /** The record's retry generation. */
  retryGeneration: number;
  /** Attempts made in the current retry generation. */
  attemptCount: number;
  /** `updatedAt` as text, to keep microsecond precision for the keyset cursor. */
  updatedAtText: string;
}

/** Where the previous page of stuck records ended; the next page starts after it. */
export interface StuckRecordCursorInterface {
  /** `updatedAt` of the last row as text, to keep microsecond precision. */
  updatedAtText: string;
  /** Public id of the last row. */
  id: string;
}
