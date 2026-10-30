import { API_V1_PREFIX } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";

describe("ImportService concurrency (integration)", () => {
  let testApp: TestAppInterface;

  beforeAll(async () => {
    testApp = await TestAppHelper.create({ runWorkers: false });
  });
  afterAll(() => testApp.close());
  beforeEach(() => testApp.truncate());

  const countRows = async (table: string) =>
    (
      (await testApp.sequelize.query(`SELECT count(*)::int AS n FROM "${table}"`))[0] as Array<{
        n: number;
      }>
    )[0]!.n;

  it("two imports with overlapping keys in reverse order: one record per key, no deadlock surfaced", async () => {
    const keys = Array.from({ length: 200 }, (_, i) => `k-${String(i).padStart(3, "0")}`);
    const forward = keys.map((externalId) => TestAppHelper.buildRecord({ externalId }));
    const backward = [...keys].reverse().map((externalId) => TestAppHelper.buildRecord({ externalId }));
    for (let round = 0; round < 3; round += 1) {
      await testApp.truncate();
      const [forwardResponse, backwardResponse] = await Promise.all([
        testApp.http().post(`${API_V1_PREFIX}/imports`).send({ records: forward }),
        testApp.http().post(`${API_V1_PREFIX}/imports`).send({ records: backward }),
      ]);
      expect([forwardResponse.status, backwardResponse.status]).toEqual([202, 202]);
      expect(forwardResponse.body.summary.accepted + backwardResponse.body.summary.accepted).toBe(200);
      expect(forwardResponse.body.summary.duplicateExisting + backwardResponse.body.summary.duplicateExisting).toBe(
        200,
      );
      expect(await countRows("Record")).toBe(200);
    }
  });

  it("two requests with the same Idempotency-Key create one import; the other replays it", async () => {
    const records = [TestAppHelper.buildRecord(), TestAppHelper.buildRecord()];
    const send = () =>
      testApp.http().post(`${API_V1_PREFIX}/imports`).set("Idempotency-Key", "same-key").send({ records });
    const [firstResponse, secondResponse] = await Promise.all([send(), send()]);
    expect([firstResponse.status, secondResponse.status]).toEqual([202, 202]);
    expect(firstResponse.body.id).toBe(secondResponse.body.id);
    expect(
      [firstResponse.headers["idempotent-replayed"], secondResponse.headers["idempotent-replayed"]].filter(Boolean),
    ).toEqual(["true"]);
    expect(await countRows("Import")).toBe(1);
    expect(await countRows("Record")).toBe(2);
  });
});
