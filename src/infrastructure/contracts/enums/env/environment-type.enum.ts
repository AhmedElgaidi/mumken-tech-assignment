/** The runtime environment the process runs in (`NODE_ENV`). */
export enum EnvironmentTypeEnum {
  /** A developer's machine: readable, detailed logs. */
  LOCAL = "local",
  /** A shared development deployment: readable, detailed logs. */
  DEVELOPMENT = "development",
  /** A pre-release deployment that mirrors production: JSON logs. */
  STAGING = "staging",
  /** The live deployment: JSON logs. */
  PRODUCTION = "production",
  /** Automated test runs: no logs. */
  TEST = "test",
}
