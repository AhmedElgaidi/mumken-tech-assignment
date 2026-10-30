import { randomUUID } from "node:crypto";
import { RecordLeaseRepository } from "../../src/infrastructure/repositories/classification/record-lease.repository";
import { ClassificationResultRepository } from "../../src/infrastructure/repositories/classification/classification-result.repository";
import { LeaseHeldException } from "../../src/modules/classification/exceptions/lease-held.exception";
import { PermanentClassificationException } from "../../src/modules/classification/exceptions/permanent-classification.exception";
import { TransientClassificationException } from "../../src/modules/classification/exceptions/transient-classification.exception";
import { ClassificationProcessor } from "../../src/modules/classification/processors/classification.processor";
import { API_V1_PREFIX } from "../support/app/constants/http.constant";
import { TEST_LEASE_MS, TEST_MAX_ATTEMPTS } from "../support/app/constants/test-app.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";

const MAX_ATTEMPTS = TEST_MAX_ATTEMPTS;
const LEASE_MS = TEST_LEASE_MS;

describe("ClassificationProcessor (integration)", () => {
  let testApp: TestAppInterface;
  let processor: ClassificationProcessor;
  let repository: RecordLeaseRepository;
  let resultRepository: ClassificationResultRepository;

  beforeAll(async () => {
    testApp = await TestAppHelper.create({ runWorkers: false });
    processor = testApp.app.get(ClassificationProcessor);
    repository = testApp.app.get(RecordLeaseRepository);
    resultRepository = testApp.app.get(ClassificationResultRepository);
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.truncate();
    testApp.fake.reset();
  });

  async function createRecord(title = "Court ruling"): Promise<string> {
    const response = await testApp
      .http()
      .post(`${API_V1_PREFIX}/imports`)
      .send({ records: [TestAppHelper.buildRecord({ title })] });
    return response.body.duplicateItems.length
      ? ""
      : ((await testApp.http().get(`${API_V1_PREFIX}/records`)).body.data.find(
          (record: { title: string }) => record.title === title,
        ).id as string);
  }
  const buildJob = (recordId: string) => ({ recordId, generation: 0 });
  const fetchRecordDetail = async (id: string) => (await testApp.http().get(`${API_V1_PREFIX}/records/${id}`)).body;
  const automaticRows = async (id: string) =>
    (
      (
        await testApp.sequelize.query(
          `SELECT count(*)::int AS n FROM "Classification" AS classification
           JOIN "Record" AS record ON record.id = classification."recordId"
           WHERE record."publicId" = '${id}' AND classification.kind = 'AUTOMATIC'`,
        )
      )[0] as Array<{ n: number }>
    )[0]!.n;
  const expireLease = (id: string) =>
    testApp.sequelize.query(
      `UPDATE "Record" SET "leaseExpiresAt" = now() - interval '1 second' WHERE "publicId" = '${id}'`,
    );

  /** Runs the job the way BullMQ would: again after each retryable error, up to `runs` times. */
  async function runUntilSettled(recordId: string, runs = MAX_ATTEMPTS + 2): Promise<string> {
    for (let i = 0; i < runs; i += 1) {
      try {
        return await processor.handle(buildJob(recordId));
      } catch (error) {
        if (!(error instanceof TransientClassificationException)) {
          return (error as Error).name;
        }
      }
    }
    return "gave-up";
  }

  it("classifies with high confidence, and sends low confidence to review", async () => {
    testApp.fake.when("[low]", () => ({ categoryCode: "economy", confidence: 0.69 }));
    const high = await createRecord("Court ruling");
    const low = await createRecord("[low] Market");
    await expect(processor.handle(buildJob(high))).resolves.toBe("classified");
    await expect(processor.handle(buildJob(low))).resolves.toBe("needs-review");
    expect((await fetchRecordDetail(low)).classificationStatus).toBe("NEEDS_REVIEW");
  });

  it("retries a transient failure and succeeds on the second attempt", async () => {
    testApp.fake.when("[once]", (input) => {
      if (input.attemptNo === 1) throw new TransientClassificationException("blip");
      return { categoryCode: "health", confidence: 0.9 };
    });
    const id = await createRecord("[once] Clinic");
    await expect(runUntilSettled(id)).resolves.toBe("classified");
    const body = await fetchRecordDetail(id);
    expect(body.attempts.items.map((attempt: { outcome: string }) => attempt.outcome)).toEqual([
      "TRANSIENT_ERROR",
      "SUCCEEDED",
    ]);
  });

  it("fails TRANSIENT_EXHAUSTED after the max attempts and PERMANENT after one", async () => {
    testApp.fake.when("[always]", () => {
      throw new TransientClassificationException("down");
    });
    testApp.fake.when("[perm]", () => {
      throw new PermanentClassificationException("bad input");
    });
    const transient = await createRecord("[always] x");
    const permanent = await createRecord("[perm] x");
    await expect(runUntilSettled(transient)).resolves.toBe("UnrecoverableError");
    await expect(runUntilSettled(permanent)).resolves.toBe("UnrecoverableError");
    expect(await fetchRecordDetail(transient)).toMatchObject({
      classificationStatus: "FAILED",
      failureKind: "TRANSIENT_EXHAUSTED",
      attempts: { total: MAX_ATTEMPTS },
    });
    expect(await fetchRecordDetail(permanent)).toMatchObject({
      classificationStatus: "FAILED",
      failureKind: "PERMANENT",
      attempts: { total: 1 },
    });
  });

  it("counts unexpected errors and invalid answers, and enforces the timeout", async () => {
    testApp.fake.when("[bug]", () => {
      throw new TypeError("cannot read x of undefined");
    });
    testApp.fake.when("[conf]", () => ({ categoryCode: "legal", confidence: 1.5 }));
    testApp.fake.when("[hang]", () => new Promise(() => undefined)); // ignores the abort signal
    const bug = await createRecord("[bug] x");
    const conf = await createRecord("[conf] x");
    const hang = await createRecord("[hang] x");
    await expect(processor.handle(buildJob(bug))).rejects.toBeInstanceOf(TransientClassificationException);
    expect((await fetchRecordDetail(bug)).attempts.items[0]).toMatchObject({
      outcome: "UNKNOWN_ERROR",
      error: expect.stringContaining("TypeError"),
    });
    await runUntilSettled(conf);
    expect(await fetchRecordDetail(conf)).toMatchObject({
      failureKind: "PERMANENT",
      attempts: { total: 1 },
    });
    await expect(processor.handle(buildJob(hang))).rejects.toThrow("timed out after 500 ms");
    expect((await fetchRecordDetail(hang)).attempts.items[0]).toMatchObject({
      outcome: "TRANSIENT_ERROR",
    });
  });

  it("runs a job twice for one record: one AUTOMATIC row, classifier called once", async () => {
    testApp.fake.latencyMs = 200;
    const id = await createRecord();
    const results = await Promise.allSettled([processor.handle(buildJob(id)), processor.handle(buildJob(id))]);
    expect(
      results
        .filter((settled) => settled.status === "fulfilled")
        .map((settled) => (settled as PromiseFulfilledResult<string>).value),
    ).toEqual(["classified"]);
    expect(results.find((settled) => settled.status === "rejected")).toMatchObject({
      reason: expect.any(LeaseHeldException),
    });
    await expect(processor.handle(buildJob(id))).resolves.toBe("skipped");
    expect(testApp.fake.calls).toHaveLength(1);
    expect(await automaticRows(id)).toBe(1);
  });

  it("crash after the classifier answered: re-claim calls it again, still one saved result (documented limit)", async () => {
    const id = await createRecord();
    const crashed = await repository.claim(id, randomUUID(), LEASE_MS, MAX_ATTEMPTS);
    await testApp.fake.classify(
      { title: crashed!.title, description: "", source: "", date: "", attemptNo: 1 },
      new AbortController().signal,
    );
    // ...the worker dies here, before saving. The lease expires.
    await expireLease(id);
    await expect(processor.handle(buildJob(id))).resolves.toBe("classified");
    expect(testApp.fake.calls).toHaveLength(2);
    expect(await automaticRows(id)).toBe(1);
    expect((await fetchRecordDetail(id)).attempts.items).toEqual([
      expect.objectContaining({ attemptNo: 2, outcome: "SUCCEEDED" }),
    ]);
  });

  it("a slow worker that lost its lease cannot overwrite the new owner", async () => {
    const id = await createRecord();
    const slow = await repository.claim(id, randomUUID(), LEASE_MS, MAX_ATTEMPTS);
    await expireLease(id);
    await expect(processor.handle(buildJob(id))).resolves.toBe("classified");
    const late = await resultRepository.saveSuccess(
      slow!,
      {
        categoryCode: "sports",
        confidence: 0.99,
        isReviewNeeded: false,
        classifier: "slow",
        rawOutput: null,
      },
      10,
    );
    expect(late).toBe("lost-lease");
    expect(await automaticRows(id)).toBe(1);
    expect((await fetchRecordDetail(id)).category).toBe("legal");
  });

  it("a record that crashes the worker every time ends FAILED after the max claims", async () => {
    const id = await createRecord();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(await repository.claim(id, randomUUID(), LEASE_MS, MAX_ATTEMPTS)).not.toBeNull();
      await expireLease(id); // crash: no result, no attempt row
    }
    await expect(processor.handle(buildJob(id))).resolves.toBe("exhausted");
    expect(await fetchRecordDetail(id)).toMatchObject({
      classificationStatus: "FAILED",
      failureKind: "TRANSIENT_EXHAUSTED",
    });
    expect(testApp.fake.calls).toHaveLength(0);
  });

  it("keeps classifications append-only in the database", async () => {
    const id = await createRecord();
    await processor.handle(buildJob(id));
    await expect(
      testApp.sequelize.query(
        `UPDATE "Classification" SET "categoryCode" = 'sports'
         WHERE "recordId" = (SELECT id FROM "Record" WHERE "publicId" = '${id}')`,
      ),
    ).rejects.toThrow(/append-only/);
    await expect(
      testApp.sequelize.query(`DELETE FROM "Classification"
         WHERE "recordId" = (SELECT id FROM "Record" WHERE "publicId" = '${id}')`),
    ).rejects.toThrow(/append-only/);
  });
});
