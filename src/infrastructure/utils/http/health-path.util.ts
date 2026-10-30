import { HEALTH_ROUTE_SEGMENT } from "../../constants/http/health.constant";

/** Builds and matches the health endpoint path, so the guard and the logger agree on it. */
export class HealthPathUtil {
  /**
   * Builds the health path prefix.
   *
   * @param apiPrefix - The global API prefix, without a leading slash (e.g. `api/v1`).
   * @returns The absolute path prefix of the health endpoint (e.g. `/api/v1/health`).
   */
  public static build(apiPrefix: string): string {
    return `/${apiPrefix}/${HEALTH_ROUTE_SEGMENT}`;
  }

  /**
   * Tells whether a request path addresses the health endpoint.
   *
   * @param path - The request path or URL.
   * @param apiPrefix - The global API prefix, without a leading slash.
   * @returns `true` when the path starts with the health path.
   */
  public static isHealthPath(path: string, apiPrefix: string): boolean {
    return path.startsWith(HealthPathUtil.build(apiPrefix));
  }
}
