import { API_V1_PREFIX, NIL_UUID } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";
import { WaitForUtil } from "../support/wait/utils/wait-for.util";

describe("ImportController (e2e)", () => {
  let testApp: TestAppInterface;

  beforeAll(async () => {
    testApp = await TestAppHelper.create({
      settings: { import: { maxRecords: 5, maxBodyBytes: "20kb" } },
    });
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.truncate();
    testApp.fake.reset();
  });

  const submitImport = (records: unknown[], key?: string) => {
    const req = testApp.http().post(`${API_V1_PREFIX}/imports`).set("content-type", "application/json");
    return (key ? req.set("Idempotency-Key", key) : req).send({ records });
  };

  describe("R1: submits multiple records for import", () => {
    it("accepts a batch with 202 and a summary", async () => {
      const response = await submitImport([
        TestAppHelper.buildRecord(),
        TestAppHelper.buildRecord(),
        TestAppHelper.buildRecord(),
      ]);
      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        status: "PROCESSING",
        summary: { total: 3, accepted: 3, invalid: 0 },
      });
      expect(response.body.links.self).toBe(`${API_V1_PREFIX}/imports/${response.body.id}`);
    });

    it("rejects request-level problems as problem+json", async () => {
      const empty = await submitImport([]);
      expect(empty.status).toBe(400);
      expect(empty.headers["content-type"]).toContain("application/problem+json");

      const tooMany = await submitImport(Array.from({ length: 6 }, () => TestAppHelper.buildRecord()));
      expect(tooMany.status).toBe(422);
      expect(tooMany.body.code).toBe("TOO_MANY_RECORDS");

      const tooLarge = await submitImport([TestAppHelper.buildRecord({ description: "x".repeat(30000) })]);
      expect(tooLarge.status).toBe(413);

      const notJson = await testApp
        .http()
        .post(`${API_V1_PREFIX}/imports`)
        .set("content-type", "text/plain")
        .send("hello");
      expect(notJson.status).toBe(415);

      const malformed = await testApp
        .http()
        .post(`${API_V1_PREFIX}/imports`)
        .set("content-type", "application/json")
        .send("{bad");
      expect(malformed.status).toBe(400);
      expect(malformed.body.code).toBe("MALFORMED_JSON");

      const notArray = await testApp.http().post(`${API_V1_PREFIX}/imports`).send({ records: "x" });
      expect(notArray.status).toBe(400);
    });
  });

  describe("R2: identifies invalid records with useful feedback", () => {
    it("accepts the valid records and reports field errors for the invalid ones", async () => {
      const response = await submitImport([
        TestAppHelper.buildRecord(),
        { title: "only a title", date: "2026-02-30" },
        TestAppHelper.buildRecord({ author: "x" }),
      ]);
      expect(response.status).toBe(202);
      expect(response.body.summary).toMatchObject({ accepted: 2, invalid: 1 });
      expect(response.body.invalidItems).toEqual([
        {
          index: 1,
          externalId: null,
          errors: expect.arrayContaining([
            expect.objectContaining({ field: "externalId", code: "REQUIRED" }),
            expect.objectContaining({ field: "description", code: "REQUIRED" }),
            expect.objectContaining({ field: "source", code: "REQUIRED" }),
            expect.objectContaining({ field: "date", code: "INVALID_DATE" }),
          ]),
        },
      ]);
      expect(response.body.warnings).toEqual([{ index: 2, code: "UNKNOWN_FIELD_IGNORED", field: "author" }]);

      const items = await testApp.http().get(`${API_V1_PREFIX}/imports/${response.body.id}/items?outcome=INVALID`);
      expect(items.body.data).toHaveLength(1);
      expect(items.body.data[0]).toMatchObject({ index: 1, outcome: "INVALID" });
    });
  });

  describe("R3: prevents duplicate records", () => {
    it("detects duplicates in the batch and against stored records, flagging changed content", async () => {
      const first = TestAppHelper.buildRecord({ externalId: "dup-1" });
      await submitImport([first]);
      const response = await submitImport([
        { ...first, source: " GOV-NEWS " },
        { ...first, externalId: "dup-2" },
        { ...first, externalId: "dup-2", title: "again" },
      ]);
      expect(response.body.summary).toMatchObject({
        accepted: 1,
        duplicateExisting: 1,
        duplicateInBatch: 1,
      });
      expect(response.body.duplicateItems).toEqual([
        expect.objectContaining({ index: 0, kind: "DUPLICATE_EXISTING", hasContentChanged: false }),
        expect.objectContaining({ index: 2, kind: "DUPLICATE_IN_BATCH", duplicateOfIndex: 1 }),
      ]);
      const changed = await submitImport([{ ...first, title: "changed title" }]);
      expect(changed.body.duplicateItems).toEqual([
        expect.objectContaining({ kind: "DUPLICATE_EXISTING", hasContentChanged: true }),
      ]);
      const records = await testApp.http().get(`${API_V1_PREFIX}/records`);
      expect(records.body.data).toHaveLength(2);
    });

    it("replays the same Idempotency-Key and body without new work; rejects a different body", async () => {
      const batch = [TestAppHelper.buildRecord(), TestAppHelper.buildRecord()];
      const first = await submitImport(batch, "key-1");
      expect(first.headers["idempotent-replayed"]).toBeUndefined();
      const replay = await submitImport(batch, "key-1");
      expect(replay.status).toBe(202);
      expect(replay.headers["idempotent-replayed"]).toBe("true");
      expect(replay.body.id).toBe(first.body.id);
      expect(replay.body.summary).toEqual(first.body.summary);

      const reused = await submitImport([TestAppHelper.buildRecord()], "key-1");
      expect(reused.status).toBe(422);
      expect(reused.body.code).toBe("IDEMPOTENCY_KEY_REUSED");

      const [{ count }] = (
        await testApp.sequelize.query(`SELECT count(*)::int AS count FROM "Import"`, {
          plain: false,
          raw: true,
        })
      )[0] as Array<{ count: number }>;
      expect(count).toBe(1);
    });

    it("validates the Idempotency-Key", async () => {
      const response = await submitImport([TestAppHelper.buildRecord()], "x".repeat(256));
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_IDEMPOTENCY_KEY");
    });
  });

  describe("R4: tracks the progress and outcome of an import", () => {
    it("reports progress until completed", async () => {
      testApp.fake.latencyMs = 50;
      const response = await submitImport([TestAppHelper.buildRecord(), TestAppHelper.buildRecord(), { bad: true }]);
      const id = response.body.id as string;
      const done = await WaitForUtil.until(async () => {
        const body = (await testApp.http().get(`${API_V1_PREFIX}/imports/${id}`)).body;
        return body.status !== "PROCESSING" ? body : null;
      });
      expect(done).toMatchObject({
        status: "COMPLETED_WITH_ISSUES",
        items: { total: 3, accepted: 2, invalid: 1 },
        classification: { classified: 2, pending: 0, processing: 0 },
        progress: { finished: 2, of: 2, percent: 100 },
      });
      expect(done.completedAt).not.toBeNull();
    });

    it("shows PROCESSING with partial progress while a record is still being classified", async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      testApp.fake.when("[hold]", async () => {
        await gate;
        return { categoryCode: "legal", confidence: 0.95 };
      });
      const response = await submitImport([
        TestAppHelper.buildRecord(),
        TestAppHelper.buildRecord({ title: "[hold] Court ruling" }),
      ]);
      const id = response.body.id as string;
      const midRun = await WaitForUtil.until(async () => {
        const body = (await testApp.http().get(`${API_V1_PREFIX}/imports/${id}`)).body;
        return body.progress.finished === 1 ? body : null;
      });
      release();
      expect(midRun).toMatchObject({ status: "PROCESSING", progress: { finished: 1, of: 2, percent: 50 } });
      expect(midRun.completedAt).toBeNull();
      const done = await WaitForUtil.until(async () => {
        const body = (await testApp.http().get(`${API_V1_PREFIX}/imports/${id}`)).body;
        return body.status !== "PROCESSING" ? body : null;
      });
      expect(done).toMatchObject({ status: "COMPLETED", progress: { finished: 2, of: 2, percent: 100 } });
    });

    it("an all-duplicate batch is COMPLETED and an all-invalid one COMPLETED_WITH_ISSUES", async () => {
      const record = TestAppHelper.buildRecord();
      await submitImport([record]);
      const duplicates = await submitImport([record]);
      expect(duplicates.body.status).toBe("COMPLETED");
      const invalid = await submitImport([{ nope: 1 }]);
      expect(invalid.body.status).toBe("COMPLETED_WITH_ISSUES");
      const detail = await testApp.http().get(`${API_V1_PREFIX}/imports/${invalid.body.id}`);
      expect(detail.body.progress).toEqual({ finished: 0, of: 0, percent: 100 });
    });

    it("pages through items and 404s unknown imports", async () => {
      const response = await submitImport([
        TestAppHelper.buildRecord(),
        TestAppHelper.buildRecord(),
        TestAppHelper.buildRecord(),
      ]);
      const page1 = await testApp.http().get(`${API_V1_PREFIX}/imports/${response.body.id}/items?limit=2`);
      expect(page1.body.data.map((item: { index: number }) => item.index)).toEqual([0, 1]);
      const page2 = await testApp
        .http()
        .get(`${API_V1_PREFIX}/imports/${response.body.id}/items?limit=2&cursor=${page1.body.nextCursor}`);
      expect(page2.body).toMatchObject({
        data: [expect.objectContaining({ index: 2 })],
        nextCursor: null,
      });
      expect((await testApp.http().get(`${API_V1_PREFIX}/imports/${NIL_UUID}`)).status).toBe(404);
      expect((await testApp.http().get(`${API_V1_PREFIX}/imports/not-a-uuid`)).status).toBe(400);
      expect((await testApp.http().get(`${API_V1_PREFIX}/imports/${response.body.id}/items?outcome=NOPE`)).status).toBe(
        400,
      );
    });
  });
});
