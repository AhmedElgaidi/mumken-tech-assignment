import { ClassificationAttemptRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-attempt-row.interface";
import { ClassificationRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-row.interface";
import { RecordRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { ClassificationViewInterface } from "../contracts/interfaces/classification-view.interface";
import { RecordDetailInterface } from "../contracts/interfaces/record-detail.interface";
import { RecordListItemInterface } from "../contracts/interfaces/record-list-item.interface";

/** Maps database rows to the shapes the API returns. */
export class RecordMapperUtil {
  /**
   * One classification row as the API shows it.
   *
   * @param row - The classification row.
   * @returns The view, with `numeric` confidence as a number and dates as ISO strings.
   */
  public static toClassificationView(row: ClassificationRowInterface): ClassificationViewInterface {
    return {
      id: row.id,
      kind: row.kind,
      categoryCode: row.categoryCode,
      confidence: RecordMapperUtil.toNumber(row.confidence),
      isReviewNeeded: row.isReviewNeeded,
      classifier: row.classifier,
      rawOutput: row.rawOutput,
      reason: row.reason,
      reviewedBy: row.reviewedBy,
      supersedesId: row.supersedesId,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  /**
   * One record row as a list entry.
   *
   * @param row - The record row joined with its current classification.
   * @returns The list item.
   */
  public static toListItem(row: RecordRowInterface): RecordListItemInterface {
    return {
      id: row.id,
      externalId: row.externalId,
      source: row.source,
      title: row.title,
      date: row.recordDate.toISOString(),
      classificationStatus: row.classificationStatus,
      failureKind: row.failureKind,
      category: row.currentCategoryCode,
      confidence: RecordMapperUtil.toNumber(row.currentConfidence),
      currentClassificationId: row.currentClassificationId,
      importId: row.importId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * One record row with its history and attempts.
   *
   * Steps:
   * 1. Map the classification history to views.
   * 2. Pick the current and the original classification.
   * 3. Build the detail with the attempt summary.
   *
   * @param row - The record row joined with its current classification.
   * @param history - Every classification of the record, oldest first.
   * @param attempts - Every classification attempt of the record.
   * @returns The detail view; `originalClassification` is the first automatic one.
   */
  public static toDetail(
    row: RecordRowInterface,
    history: ClassificationRowInterface[],
    attempts: ClassificationAttemptRowInterface[],
  ): RecordDetailInterface {
    // 1. Map the classification history to views.
    const classificationViews = history.map(RecordMapperUtil.toClassificationView);

    // 2. Pick the current and the original classification.
    const currentClassification = classificationViews.find((view) => view.id === row.currentClassificationId) ?? null;
    const originalClassification =
      classificationViews.find((view) => view.kind === ClassificationKindEnum.AUTOMATIC) ?? null;

    // 3. Build the detail with the attempt summary.
    return {
      ...RecordMapperUtil.toListItem(row),
      description: row.description,
      retryGeneration: row.retryGeneration,
      lastError: row.lastError,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      classification: currentClassification,
      originalClassification,
      history: classificationViews,
      attempts: {
        total: attempts.length,
        currentGeneration: attempts.filter((attempt) => attempt.retryGeneration === row.retryGeneration).length,
        lastError: row.lastError,
        items: attempts.map((attempt) => ({
          retryGeneration: attempt.retryGeneration,
          attemptNo: attempt.attemptNo,
          outcome: attempt.outcome,
          error: attempt.error,
          durationMs: attempt.durationMs,
          createdAt: new Date(attempt.createdAt).toISOString(),
        })),
      },
    };
  }

  /**
   * pg returns `numeric` as a string; the API returns numbers.
   *
   * @param numericValue - The value as the database returned it.
   * @returns The number, or `null` when there is no value.
   */
  private static toNumber(numericValue: string | number | null): number | null {
    return numericValue === null ? null : Number(numericValue);
  }
}
