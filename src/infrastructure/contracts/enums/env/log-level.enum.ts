/** Pino log levels, from most to least severe, plus `silent`. */
export enum LogLevelEnum {
  /** The process cannot continue. */
  FATAL = "fatal",
  /** An operation failed. */
  ERROR = "error",
  /** Something unexpected that did not fail the operation. */
  WARN = "warn",
  /** Normal lifecycle events. */
  INFO = "info",
  /** Detail for diagnosing a problem. */
  DEBUG = "debug",
  /** The finest detail. */
  TRACE = "trace",
  /** Nothing is logged. */
  SILENT = "silent",
}
