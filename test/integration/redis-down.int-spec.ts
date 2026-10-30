import { ClassificationJobUtil } from "../../src/modules/classification/utils/classification-job.util";
import { SweeperService } from "../../src/modules/classification/services/sweeper.service";
import { API_V1_PREFIX } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";

describe("ImportService with Redis unavailable (integration)", () => {
  const realRedis = process.env.REDIS_URL!;
  let down: TestAppInterface;

  beforeAll(async () => {
    down = await TestAppHelper.create({ runWorkers: false, env: { REDIS_URL: "redis://127.0.0.1:1" } });
    await down.truncate();
  });
  afterAll(async () => {
    await down.close();
    process.env.REDIS_URL = realRedis;
  });

  it("still accepts the import, keeps records PENDING, and the sweeper enqueues them once Redis is back", async () => {
    const response = await down
      .http()
      .post(`${API_V1_PREFIX}/imports`)
      .send({ records: [TestAppHelper.buildRecord(), TestAppHelper.buildRecord()] });
    expect(response.status).toBe(202);
    expect(response.body.summary.accepted).toBe(2);

    const ready = await down.http().get(`${API_V1_PREFIX}/health/ready`);
    expect(ready.status).toBe(200);
    expect(ready.body.details.redis).toMatchObject({ state: "degraded" });

    const pending = (await down.http().get(`${API_V1_PREFIX}/records?status=PENDING`)).body.data as Array<{
      id: string;
    }>;
    expect(pending).toHaveLength(2);

    process.env.REDIS_URL = realRedis;
    const back = await TestAppHelper.create({ runWorkers: false });
    try {
      const report = await back.app.get(SweeperService).sweep();
      expect(report.requeued).toBe(2);
      for (const record of pending) {
        expect(await (await back.queue.getJob(ClassificationJobUtil.getJobId(record.id, 0)))?.getState()).toBe(
          "waiting",
        );
      }
    } finally {
      await back.close();
    }
  });
});
