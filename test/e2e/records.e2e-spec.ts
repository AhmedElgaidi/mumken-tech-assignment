import { API_V1_PREFIX, NIL_UUID } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";
import { WaitForUtil } from "../support/wait/utils/wait-for.util";

describe("RecordController and CategoryController (e2e)", () => {
  let testApp: TestAppInterface;

  beforeAll(async () => {
    testApp = await TestAppHelper.create();
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.truncate();
    testApp.fake.reset();
  });

  async function importAndWaitUntilSettled(records: unknown[]): Promise<string> {
    const response = await testApp.http().post(`${API_V1_PREFIX}/imports`).send({ records });
    const id = response.body.id as string;
    await WaitForUtil.until(
      async () => (await testApp.http().get(`${API_V1_PREFIX}/imports/${id}`)).body.status !== "PROCESSING",
    );
    return id;
  }

  describe("R5: retrieves and filters stored records", () => {
    beforeEach(async () => {
      testApp.fake.when("Sports", () => ({ categoryCode: "sports", confidence: 0.9 }));
      testApp.fake.when("Unsure", () => ({ categoryCode: "economy", confidence: 0.2 }));
      await importAndWaitUntilSettled([
        TestAppHelper.buildRecord({
          externalId: "r1",
          source: "Gov-News",
          title: "Sports final",
          date: "2026-10-01",
        }),
        TestAppHelper.buildRecord({
          externalId: "r2",
          source: "blog",
          title: "Court case 100%",
          date: "2026-10-15T23:30:00+00:00",
        }),
        TestAppHelper.buildRecord({
          externalId: "r3",
          source: "blog",
          title: "Unsure market",
          date: "2026-10-20",
        }),
      ]);
    });

    const listRecords = (query: string) => testApp.http().get(`${API_V1_PREFIX}/records?${query}`);
    const externalIdsOf = (body: { data: Array<{ externalId: string }> }) =>
      body.data.map((record) => record.externalId);

    it("filters by each field", async () => {
      expect(externalIdsOf((await listRecords("")).body)).toEqual(["r3", "r2", "r1"]);
      expect(externalIdsOf((await listRecords("source=%20GOV-NEWS%20")).body)).toEqual(["r1"]);
      expect(externalIdsOf((await listRecords("category=sports")).body)).toEqual(["r1"]);
      expect(externalIdsOf((await listRecords("status=CLASSIFIED")).body)).toEqual(["r2", "r1"]);
      expect(externalIdsOf((await listRecords("dateFrom=2026-10-15&dateTo=2026-10-20")).body)).toEqual(["r3", "r2"]);
      expect(externalIdsOf((await listRecords("dateTo=2026-10-15")).body)).toEqual(["r2", "r1"]); // date-only dateTo includes the day
      expect(externalIdsOf((await listRecords("q=100%25")).body)).toEqual(["r2"]); // % is a literal, not a wildcard
      expect(externalIdsOf((await listRecords("q=court")).body)).toEqual(["r2"]);
      const importId = (await listRecords("")).body.data[0].importId;
      expect(externalIdsOf((await listRecords(`importId=${importId}`)).body)).toHaveLength(3);
    });

    it("paginates with a cursor bound to its filters", async () => {
      const page1 = await listRecords("limit=2");
      expect(externalIdsOf(page1.body)).toEqual(["r3", "r2"]);
      const page2 = await listRecords(`limit=2&cursor=${page1.body.nextCursor}`);
      expect(page2.body).toMatchObject({ nextCursor: null });
      expect(externalIdsOf(page2.body)).toEqual(["r1"]);
      const reused = await listRecords(`limit=2&source=blog&cursor=${page1.body.nextCursor}`);
      expect(reused.status).toBe(400);
      expect(reused.body.code).toBe("INVALID_CURSOR");
    });

    it("rejects bad filters", async () => {
      for (const query of [
        "status=DONE",
        "category=astrology",
        "dateFrom=2026-10-20&dateTo=2026-10-01",
        "dateFrom=yesterday",
        "cursor=garbage",
        "limit=0",
      ]) {
        expect((await listRecords(query)).status).toBe(400);
      }
    });
  });

  describe("R6: retrieves one record with its classification result", () => {
    it("returns the record, current classification, history and attempts", async () => {
      testApp.fake.when("[flaky]", (input) => {
        if (input.attemptNo === 1) throw new Error("boom");
        return { categoryCode: "health", confidence: 0.91, raw: { model: "x" } };
      });
      await importAndWaitUntilSettled([TestAppHelper.buildRecord({ externalId: "d1", title: "[flaky] Hospital" })]);
      const [record] = (await testApp.http().get(`${API_V1_PREFIX}/records`)).body.data;
      const detail = (await testApp.http().get(`${API_V1_PREFIX}/records/${record.id}`)).body;
      expect(detail).toMatchObject({
        externalId: "d1",
        description: expect.any(String),
        classificationStatus: "CLASSIFIED",
        category: "health",
        confidence: 0.91,
        classification: {
          kind: "AUTOMATIC",
          categoryCode: "health",
          confidence: 0.91,
          rawOutput: { model: "x" },
        },
        originalClassification: { kind: "AUTOMATIC" },
        history: [expect.objectContaining({ kind: "AUTOMATIC" })],
        attempts: { total: 2, currentGeneration: 2 },
      });
      expect(detail.attempts.items.map((attempt: { outcome: string }) => attempt.outcome)).toEqual([
        "UNKNOWN_ERROR",
        "SUCCEEDED",
      ]);
      expect((await testApp.http().get(`${API_V1_PREFIX}/records/${NIL_UUID}`)).status).toBe(404);
    });
  });

  describe("R7: identifies results that require manual review", () => {
    it("lists low-confidence and unknown-category results in the review queue", async () => {
      testApp.fake.when("[low]", () => ({ categoryCode: "economy", confidence: 0.5 }));
      testApp.fake.when("[weird]", () => ({
        categoryCode: "astrology",
        confidence: 0.99,
        raw: { said: "astrology" },
      }));
      await importAndWaitUntilSettled([
        TestAppHelper.buildRecord({ externalId: "q1", title: "[low] Market" }),
        TestAppHelper.buildRecord({ externalId: "q2", title: "[weird] Stars" }),
        TestAppHelper.buildRecord({ externalId: "q3", title: "Court" }),
      ]);
      const queue = (await testApp.http().get(`${API_V1_PREFIX}/records?status=NEEDS_REVIEW`)).body.data;
      expect(queue.map((record: { externalId: string }) => record.externalId).sort()).toEqual(["q1", "q2"]);
      const weird = queue.find((record: { externalId: string }) => record.externalId === "q2");
      expect(weird).toMatchObject({
        category: "other",
        confidence: 0,
        currentClassificationId: expect.any(String),
      });
      const detail = (await testApp.http().get(`${API_V1_PREFIX}/records/${weird.id}`)).body;
      expect(detail.classification.rawOutput).toMatchObject({ unknownCategory: "astrology" });
    });
  });

  it("lists categories", async () => {
    const response = await testApp.http().get(`${API_V1_PREFIX}/categories`);
    expect(response.body.data.map((category: { code: string }) => category.code)).toContain("health");
  });
});
