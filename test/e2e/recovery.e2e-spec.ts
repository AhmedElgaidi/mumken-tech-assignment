import { PermanentClassificationException } from "../../src/modules/classification/exceptions/permanent-classification.exception";
import { TransientClassificationException } from "../../src/modules/classification/exceptions/transient-classification.exception";
import { API_V1_PREFIX } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";
import { WaitForUtil } from "../support/wait/utils/wait-for.util";

describe("RecoveryController (e2e)", () => {
  describe("R9: recovers failed records without duplicating data or repeating successful work", () => {
    let testApp: TestAppInterface;
    let isHealthy = false;

    beforeAll(async () => {
      testApp = await TestAppHelper.create();
    });
    afterAll(() => testApp.close());
    beforeEach(async () => {
      await testApp.truncate();
      testApp.fake.reset();
      isHealthy = false;
      testApp.fake.when("[down]", () => {
        if (!isHealthy) throw new TransientClassificationException("provider down");
        return { categoryCode: "technology", confidence: 0.9 };
      });
      testApp.fake.when("[broken]", () => {
        if (!isHealthy) throw new PermanentClassificationException("cannot parse");
        return { categoryCode: "culture", confidence: 0.9 };
      });
    });

    async function importAndWaitUntilSettled(records: unknown[]): Promise<string> {
      const importId = (await testApp.http().post(`${API_V1_PREFIX}/imports`).send({ records })).body.id as string;
      await WaitForUtil.until(
        async () => (await testApp.http().get(`${API_V1_PREFIX}/imports/${importId}`)).body.status !== "PROCESSING",
      );
      return importId;
    }
    const countRecords = async () =>
      (
        (await testApp.sequelize.query(`SELECT count(*)::int AS n FROM "Record"`))[0] as Array<{
          n: number;
        }>
      )[0]!.n;

    it("requeues only retryable failures; classified records are not re-run; a second retry requeues 0", async () => {
      const importId = await importAndWaitUntilSettled([
        TestAppHelper.buildRecord({ title: "[down] Cloud" }),
        TestAppHelper.buildRecord({ title: "[broken] Art" }),
        TestAppHelper.buildRecord({ title: "Court ruling" }),
      ]);
      const before = (await testApp.http().get(`${API_V1_PREFIX}/imports/${importId}`)).body;
      expect(before.classification).toMatchObject({ classified: 1, failed: 2 });
      expect(testApp.fake.callsFor("[down]")).toBe(3); // CLASSIFICATION_MAX_ATTEMPTS in tests
      expect(testApp.fake.callsFor("[broken]")).toBe(1); // permanent: no automatic retries
      const recordsBefore = await countRecords();

      isHealthy = true;
      const retry = await testApp.http().post(`${API_V1_PREFIX}/imports/${importId}/retry`).send({});
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({
        requeued: 1,
        skipped: { permanent: 1, classified: 1, needsReview: 0, inProgress: 0 },
      });
      const again = await testApp.http().post(`${API_V1_PREFIX}/imports/${importId}/retry`);
      expect(again.body.requeued).toBe(0);

      await WaitForUtil.until(
        async () =>
          (await testApp.http().get(`${API_V1_PREFIX}/imports/${importId}`)).body.classification.classified === 2,
      );
      expect(testApp.fake.callsFor("Court ruling")).toBe(1);
      expect(testApp.fake.callsFor("[down]")).toBe(4);
      expect(await countRecords()).toBe(recordsBefore);

      const forced = await testApp.http().post(`${API_V1_PREFIX}/imports/${importId}/retry`).send({ isForced: true });
      expect(forced.body.requeued).toBe(1);
      const done = await WaitForUtil.until(async () => {
        const body = (await testApp.http().get(`${API_V1_PREFIX}/imports/${importId}`)).body;
        return body.status === "COMPLETED" ? body : null;
      });
      expect(done.classification).toMatchObject({ classified: 3, failed: 0 });
      expect(testApp.fake.callsFor("Court ruling")).toBe(1);
    });

    it("retries one record, keeps its attempt history, and refuses records with nothing to recover", async () => {
      await importAndWaitUntilSettled([
        TestAppHelper.buildRecord({ title: "[down] Cloud" }),
        TestAppHelper.buildRecord({ title: "[broken] Art" }),
        TestAppHelper.buildRecord({ title: "Court" }),
      ]);
      const findRecordByTitle = async (part: string) =>
        (await testApp.http().get(`${API_V1_PREFIX}/records`)).body.data.find((record: { title: string }) =>
          record.title.includes(part),
        );
      const down = await findRecordByTitle("[down]");
      const broken = await findRecordByTitle("[broken]");
      const ok = await findRecordByTitle("Court");

      expect((await testApp.http().post(`${API_V1_PREFIX}/records/${ok.id}/retry`).send({})).body.code).toBe(
        "NOTHING_TO_RECOVER",
      );
      const permanent = await testApp.http().post(`${API_V1_PREFIX}/records/${broken.id}/retry`).send({});
      expect(permanent.status).toBe(409);
      expect(permanent.body.code).toBe("PERMANENT_FAILURE");

      isHealthy = true;
      const retried = await testApp.http().post(`${API_V1_PREFIX}/records/${down.id}/retry`).send({});
      expect(retried.status).toBe(200);
      expect(retried.body).toMatchObject({ retryGeneration: 1 });
      const detail = await WaitForUtil.until(async () => {
        const body = (await testApp.http().get(`${API_V1_PREFIX}/records/${down.id}`)).body;
        return body.classificationStatus === "CLASSIFIED" ? body : null;
      });
      expect(detail.attempts.items.map((attempt: { retryGeneration: number }) => attempt.retryGeneration)).toEqual([
        0, 0, 0, 1,
      ]);
    });

    it("classifies a FAILED record by hand when no classifier can", async () => {
      await importAndWaitUntilSettled([TestAppHelper.buildRecord({ title: "[broken] Art" })]);
      const failed = (await testApp.http().get(`${API_V1_PREFIX}/records?status=FAILED`)).body.data[0];
      expect(failed).toMatchObject({ failureKind: "PERMANENT", currentClassificationId: null });
      const body = {
        categoryCode: "culture",
        reason: "Exhibition news",
        reviewedBy: "nada",
        expectedCurrentClassificationId: null,
      };
      const response = await testApp.http().post(`${API_V1_PREFIX}/records/${failed.id}/classifications`).send(body);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        classificationStatus: "CLASSIFIED",
        failureKind: null,
        category: "culture",
        originalClassification: null,
      });
      expect(
        (await testApp.http().post(`${API_V1_PREFIX}/records/${failed.id}/classifications`).send(body)).status,
      ).toBe(200);
    });
  });
});
