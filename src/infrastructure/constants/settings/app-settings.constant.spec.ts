import { DEFAULT_APP_SETTINGS } from "./app-settings.constant";

describe("DEFAULT_APP_SETTINGS", () => {
  it("keeps the lease longer than one classifier call, so a live worker never loses its record", () => {
    const { leaseMs, classifierTimeoutMs } = DEFAULT_APP_SETTINGS.classification;
    expect(leaseMs).toBeGreaterThan(classifierTimeoutMs);
  });

  it("keeps the review threshold a fraction between 0 and 1", () => {
    expect(DEFAULT_APP_SETTINGS.classification.reviewThreshold).toBeGreaterThan(0);
    expect(DEFAULT_APP_SETTINGS.classification.reviewThreshold).toBeLessThan(1);
  });
});
