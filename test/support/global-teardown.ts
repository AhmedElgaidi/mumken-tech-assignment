/**
 * Stops the PostgreSQL and Redis containers that the global setup started.
 *
 * @returns Resolves once both containers have stopped.
 */
export default async function globalTeardown(): Promise<void> {
  await Promise.all([globalThis.testContainers?.postgres.stop(), globalThis.testContainers?.redis.stop()]);
}
