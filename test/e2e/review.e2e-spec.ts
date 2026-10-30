import { API_V1_PREFIX } from "../support/app/constants/http.constant";
import { TestAppHelper } from "../support/app/helpers/test-app.helper";
import { TestAppInterface } from "../support/app/contracts/interfaces/test-app.interface";
import { WaitForUtil } from "../support/wait/utils/wait-for.util";

describe("ReviewController (e2e)", () => {
  describe("R8: corrects a classification while preserving the original", () => {
    let testApp: TestAppInterface;

    beforeAll(async () => {
      testApp = await TestAppHelper.create();
    });
    afterAll(() => testApp.close());
    beforeEach(async () => {
      await testApp.truncate();
      testApp.fake.reset();
      testApp.fake.when("[low]", () => ({ categoryCode: "economy", confidence: 0.4 }));
    });

    async function waitForRecordWithStatus(
      status: string,
      title: string,
    ): Promise<{ id: string; currentClassificationId: string | null }> {
      await testApp
        .http()
        .post(`${API_V1_PREFIX}/imports`)
        .send({ records: [TestAppHelper.buildRecord({ title })] });
      return WaitForUtil.until(
        async () => (await testApp.http().get(`${API_V1_PREFIX}/records?status=${status}`)).body.data[0],
      );
    }

    const postCorrection = (id: string, body: Record<string, unknown>) =>
      testApp
        .http()
        .post(`${API_V1_PREFIX}/records/${id}/classifications`)
        .send({ reason: "about clinics", reviewedBy: "nada", ...body });
    const postApproval = (id: string, expected: string | null) =>
      testApp
        .http()
        .post(`${API_V1_PREFIX}/records/${id}/review/approve`)
        .send({ reviewedBy: "nada", expectedCurrentClassificationId: expected });

    it("appends a correction and keeps the automatic original visible", async () => {
      const record = await waitForRecordWithStatus("NEEDS_REVIEW", "[low] Market");
      const response = await postCorrection(record.id, {
        categoryCode: "health",
        expectedCurrentClassificationId: record.currentClassificationId,
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        classificationStatus: "CLASSIFIED",
        category: "health",
        classification: {
          kind: "MANUAL_CORRECTION",
          categoryCode: "health",
          reason: "about clinics",
          reviewedBy: "nada",
          supersedesId: record.currentClassificationId,
        },
        originalClassification: {
          id: record.currentClassificationId,
          kind: "AUTOMATIC",
          categoryCode: "economy",
          confidence: 0.4,
        },
      });
      expect(response.body.history.map((entry: { kind: string }) => entry.kind)).toEqual([
        "AUTOMATIC",
        "MANUAL_CORRECTION",
      ]);
      expect((await testApp.http().get(`${API_V1_PREFIX}/records?status=NEEDS_REVIEW`)).body.data).toHaveLength(0);
    });

    it("is idempotent and detects concurrent reviewers", async () => {
      const record = await waitForRecordWithStatus("NEEDS_REVIEW", "[low] Market");
      const body = {
        categoryCode: "health",
        expectedCurrentClassificationId: record.currentClassificationId,
      };
      const [firstCorrection, secondCorrection] = await Promise.all([
        postCorrection(record.id, body),
        postCorrection(record.id, { ...body, categoryCode: "sports" }),
      ]);
      expect([firstCorrection.status, secondCorrection.status].sort()).toEqual([201, 409]);
      const loser = firstCorrection.status === 409 ? firstCorrection : secondCorrection;
      expect(loser.body).toMatchObject({
        code: "STALE_CLASSIFICATION",
        current: { classificationStatus: "CLASSIFIED" },
      });

      const winnerBody = firstCorrection.status === 201 ? body : { ...body, categoryCode: "sports" };
      const repeat = await postCorrection(record.id, winnerBody);
      expect(repeat.status).toBe(200);
      expect(repeat.body.history).toHaveLength(2);
    });

    it("rejects the same category, unknown categories, and records still being classified", async () => {
      const record = await waitForRecordWithStatus("NEEDS_REVIEW", "[low] Market");
      const same = await postCorrection(record.id, {
        categoryCode: "economy",
        expectedCurrentClassificationId: record.currentClassificationId,
      });
      expect(same.status).toBe(422);
      expect(same.body.code).toBe("SAME_CATEGORY");
      const unknown = await postCorrection(record.id, {
        categoryCode: "astrology",
        expectedCurrentClassificationId: record.currentClassificationId,
      });
      expect(unknown.status).toBe(400);
      const invalid = await postCorrection(record.id, { categoryCode: "health" });
      expect(invalid.status).toBe(400);
      expect(invalid.body.errors).toEqual([expect.objectContaining({ field: "expectedCurrentClassificationId" })]);

      testApp.fake.latencyMs = 400;
      await testApp
        .http()
        .post(`${API_V1_PREFIX}/imports`)
        .send({ records: [TestAppHelper.buildRecord({ externalId: "slow" })] });
      const pending = (await testApp.http().get(`${API_V1_PREFIX}/records?status=PENDING,PROCESSING`)).body.data[0];
      const busy = await postCorrection(pending.id, {
        categoryCode: "health",
        expectedCurrentClassificationId: null,
      });
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe("CLASSIFICATION_IN_PROGRESS");
    });

    it("approves a review once; a repeat is 200; a non-review record is 409", async () => {
      const record = await waitForRecordWithStatus("NEEDS_REVIEW", "[low] Market");
      const first = await postApproval(record.id, record.currentClassificationId);
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        classificationStatus: "CLASSIFIED",
        category: "economy",
        classification: { kind: "MANUAL_APPROVAL" },
      });
      const again = await postApproval(record.id, record.currentClassificationId);
      expect(again.status).toBe(200);
      expect(again.body.history).toHaveLength(2);

      const classified = await waitForRecordWithStatus("CLASSIFIED", "Court");
      const notInReview = await postApproval(classified.id, classified.currentClassificationId);
      expect(notInReview.status).toBe(409);
      expect(notInReview.body.code).toBe("NOT_IN_REVIEW");
    });

    it("moves the import to COMPLETED when its last review is resolved", async () => {
      const response = await testApp
        .http()
        .post(`${API_V1_PREFIX}/imports`)
        .send({
          records: [TestAppHelper.buildRecord({ title: "[low] Market" }), TestAppHelper.buildRecord()],
        });
      const importId = response.body.id as string;
      await WaitForUtil.until(
        async () =>
          (await testApp.http().get(`${API_V1_PREFIX}/imports/${importId}`)).body.status === "COMPLETED_WITH_ISSUES",
      );
      const record = (await testApp.http().get(`${API_V1_PREFIX}/records?status=NEEDS_REVIEW`)).body.data[0];
      await postApproval(record.id, record.currentClassificationId);
      expect((await testApp.http().get(`${API_V1_PREFIX}/imports/${importId}`)).body.status).toBe("COMPLETED");
    });
  });
});
