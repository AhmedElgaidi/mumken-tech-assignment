/** Redis state reported by the readiness probe. Redis is never reported as down. */
export enum RedisHealthStateEnum {
  /** Redis answered the ping. */
  UP = "up",
  /** Redis did not answer; imports still work and the sweeper catches up later. */
  DEGRADED = "degraded",
}
