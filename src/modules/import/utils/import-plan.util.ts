import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";
import { ValidRecordInterface } from "../contracts/interfaces/item/valid-record.interface";
import { ItemValidationType } from "../contracts/types/item-validation.type";
import { ImportPlanInterface } from "../contracts/interfaces/plan/import-plan.interface";
import { PlanCandidateInterface } from "../contracts/interfaces/plan/plan-candidate.interface";
import { PlannedItemInterface } from "../contracts/interfaces/plan/planned-item.interface";

/** Turns validated items into a plan: which are invalid, which repeat an earlier item, which to store. */
export class ImportPlanUtil {
  /**
   * The identity of a record inside a batch and across imports.
   *
   * @param record - Anything carrying the source key and external id.
   * @returns A string that is equal exactly when both parts are equal.
   */
  public static getRecordKey(record: Pick<ValidRecordInterface, "sourceKey" | "externalId">): string {
    return JSON.stringify([record.sourceKey, record.externalId]);
  }

  /**
   * Marks invalid items as `INVALID` and later occurrences of the same `(source, externalId)`
   * in one batch as duplicates of the first. The first valid occurrence of each key becomes a
   * candidate, sorted by key so concurrent imports lock rows in one order.
   *
   * Steps:
   * 1. Set up the key index and the candidate list.
   * 2. Plan every item.
   * 3. Sort the candidates by key.
   * 4. Return the plan.
   *
   * @param validations - One validation result per submitted item, in batch order.
   * @returns Every item with its outcome so far, and the sorted candidates.
   */
  public static planImport(validations: ItemValidationType[]): ImportPlanInterface {
    // 1. Set up the key index and the candidate list.
    const firstIndexByKey = new Map<string, number>();
    const candidates: PlanCandidateInterface[] = [];

    // 2. Plan every item.
    const items = validations.map((validation, index): PlannedItemInterface => {
      if (!validation.isValid) {
        return {
          index,
          validation,
          outcome: ImportItemOutcomeEnum.INVALID,
          duplicateOfIndex: null,
        };
      }
      const key = ImportPlanUtil.getRecordKey(validation.record);
      const firstIndex = firstIndexByKey.get(key);
      if (firstIndex !== undefined) {
        return {
          index,
          validation,
          outcome: ImportItemOutcomeEnum.DUPLICATE_IN_BATCH,
          duplicateOfIndex: firstIndex,
        };
      }
      firstIndexByKey.set(key, index);
      candidates.push({ index, record: validation.record });
      return { index, validation, outcome: null, duplicateOfIndex: null };
    });

    // 3. Sort the candidates by key.
    candidates.sort((left, right) => ImportPlanUtil.compareCandidates(left, right));

    // 4. Return the plan.
    return { items, candidates };
  }

  /**
   * Orders two candidates by source key, then external id.
   *
   * @param left - The first candidate.
   * @param right - The second candidate.
   * @returns A negative number, a positive number or zero, as a sort comparator.
   */
  private static compareCandidates(left: PlanCandidateInterface, right: PlanCandidateInterface): number {
    if (left.record.sourceKey !== right.record.sourceKey) {
      return ImportPlanUtil.compareText(left.record.sourceKey, right.record.sourceKey);
    }
    return ImportPlanUtil.compareText(left.record.externalId, right.record.externalId);
  }

  /**
   * Plain code-unit order; every import sorts the same way, which is all lock ordering needs.
   *
   * Steps:
   * 1. Return -1 when the first text sorts first.
   * 2. Return 1 when the first text sorts last.
   * 3. Return 0 when the texts are equal.
   *
   * @param left - The first text.
   * @param right - The second text.
   * @returns A negative number, a positive number or zero, as a sort comparator.
   */
  private static compareText(left: string, right: string): number {
    // 1. Return -1 when the first text sorts first.
    if (left < right) {
      return -1;
    }

    // 2. Return 1 when the first text sorts last.
    if (left > right) {
      return 1;
    }

    // 3. Return 0 when the texts are equal.
    return 0;
  }
}
