import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { ClassificationJobUtil } from "../../src/modules/classification/utils/classification-job.util";
import { ClassificationProcessor } from "../../src/modules/classification/processors/classification.processor";
import { SweeperService } from "../../src/modules/classification/services/sweeper.service";
import { API_V1_PREFIX } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";

describe("SweeperService (integration)", () => {
  let testApp: TestAppInterface;
  let sweeper: SweeperService;

  beforeAll(async () => {
    testApp = await TestAppHelper.create({ runWorkers: false, settings: { sweeper: { batchSize: 2 } } });
    sweeper = testApp.app.get(SweeperService);
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.truncate();
    testApp.fake.reset();
  });

  async function createRecords(count: number): Promise<string[]> {
    await testApp
      .http()
      .post(`${API_V1_PREFIX}/imports`)
      .send({ records: Array.from({ length: count }, () => TestAppHelper.buildRecord()) });
    const rows = (
      await testApp.sequelize.query(`SELECT "publicId" AS id FROM "Record" ORDER BY "createdAt"`)
    )[0] as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }
  const getJobState = async (id: string) =>
    (await testApp.queue.getJob(ClassificationJobUtil.getJobId(id, 0)))?.getState();

  it("enqueues PENDING records that have no job, across several pages", async () => {
    const ids = await createRecords(5);
    await testApp.queue.obliterate({ force: true }); // as if enqueue had failed
    const report = await sweeper.sweep();
    expect(report).toMatchObject({ scanned: 5, requeued: 5 });
    for (const id of ids) {
      expect(await getJobState(id)).toBe("waiting");
    }
    expect((await sweeper.sweep()).alreadyQueued).toBe(5);
  });

  it("re-adds a job whose completed copy still exists (BullMQ would ignore a plain add)", async () => {
    const [id] = await createRecords(1);
    await testApp.queue.obliterate({ force: true });
    await testApp.queue.add(
      "classify",
      { recordId: id!, generation: 0 },
      { jobId: ClassificationJobUtil.getJobId(id!, 0), removeOnComplete: false },
    );
    const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    const done = new Promise<void>((resolve) => {
      const worker = new Worker(testApp.queue.name, async () => "noop", {
        connection,
        prefix: testApp.settings.queue.prefix,
      });
      worker.on("completed", () => void worker.close().then(resolve));
    });
    await done;
    connection.disconnect();
    expect(await getJobState(id!)).toBe("completed");

    expect((await sweeper.sweep()).requeued).toBe(1);
    expect(await getJobState(id!)).toBe("waiting");
    await expect(testApp.app.get(ClassificationProcessor).handle({ recordId: id!, generation: 0 })).resolves.toBe(
      "classified",
    );
  });

  it("skips a job that turned active while being replaced", async () => {
    await createRecords(1);
    const fakeJob = {
      getState: async () => "completed",
      remove: async () => Promise.reject(new Error("job is locked")),
    } as unknown as Job;
    const spy = jest.spyOn(testApp.queue, "getJob").mockResolvedValue(fakeJob);
    expect((await sweeper.sweep()).skippedActive).toBe(1);
    spy.mockRestore();
  });

  it("re-queues expired leases, fails exhausted ones, and never touches finished records", async () => {
    const [expired, exhausted, done, failed] = await createRecords(4);
    await testApp.queue.obliterate({ force: true });
    await testApp.sequelize.query(`
      UPDATE "Record" SET "classificationStatus" = 'PROCESSING', "leaseToken" = gen_random_uuid(),
             "leaseExpiresAt" = now() - interval '1 second', "attemptCount" = 1 WHERE "publicId" = '${expired}';
      UPDATE "Record" SET "classificationStatus" = 'PROCESSING', "leaseToken" = gen_random_uuid(),
             "leaseExpiresAt" = now() - interval '1 second', "attemptCount" = 3 WHERE "publicId" = '${exhausted}';
      UPDATE "Record" SET "classificationStatus" = 'FAILED', "failureKind" = 'PERMANENT' WHERE "publicId" = '${failed}';`);
    await testApp.app.get(ClassificationProcessor).handle({ recordId: done!, generation: 0 });
    await testApp.queue.obliterate({ force: true });

    const report = await sweeper.sweep();
    expect(report).toMatchObject({ requeued: 1, exhausted: 1, scanned: 2 });
    expect(await getJobState(expired!)).toBe("waiting");
    expect(await getJobState(done!)).toBeUndefined();
    expect(await getJobState(failed!)).toBeUndefined();
    const statuses = (
      await testApp.sequelize.query(`SELECT "failureKind" FROM "Record" WHERE "publicId" = '${exhausted}'`)
    )[0] as Array<{ failureKind: string }>;
    expect(statuses[0]!.failureKind).toBe("TRANSIENT_EXHAUSTED");
    await expect(testApp.app.get(ClassificationProcessor).handle({ recordId: expired!, generation: 0 })).resolves.toBe(
      "classified",
    );
  });
});
