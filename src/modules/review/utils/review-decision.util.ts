import { ClassificationRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-row.interface";
import { RecordRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../classification/contracts/enums/lifecycle/record-trigger.enum";
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";

/** The questions a review action asks about a record and its current classification. */
export class ReviewDecisionUtil {
  /**
   * Tells whether the same approval was already stored, so repeating it must change nothing.
   *
   * @param record - The locked record.
   * @param currentClassification - The classification the record points at, when it has one.
   * @param expectedClassificationId - The classification id the reviewer saw.
   * @returns `true` when the current classification is the approval of exactly that classification.
   */
  public static isRepeatedApproval(
    record: RecordRowInterface,
    currentClassification: ClassificationRowInterface | null,
    expectedClassificationId: string,
  ): boolean {
    return (
      record.classificationStatus === RecordStatusEnum.CLASSIFIED &&
      currentClassification?.kind === ClassificationKindEnum.MANUAL_APPROVAL &&
      currentClassification.supersedesId === expectedClassificationId
    );
  }

  /**
   * Tells whether the same correction was already stored, so repeating it must change nothing.
   *
   * @param currentClassification - The classification the record points at, when it has one.
   * @param categoryCode - The normalised category the reviewer chose.
   * @param dto - The correction the reviewer sent.
   * @returns `true` when the current classification is exactly this correction.
   */
  public static isRepeatedCorrection(
    currentClassification: ClassificationRowInterface | null,
    categoryCode: string,
    dto: CorrectClassificationDto,
  ): boolean {
    return (
      currentClassification?.kind === ClassificationKindEnum.MANUAL_CORRECTION &&
      currentClassification.supersedesId === dto.expectedCurrentClassificationId &&
      currentClassification.categoryCode === categoryCode &&
      currentClassification.reason === dto.reason &&
      currentClassification.reviewedBy === dto.reviewedBy
    );
  }

  /**
   * Picks the state-machine trigger of a correction: a FAILED record is classified by hand, any other is corrected.
   *
   * @param record - The locked record.
   * @returns The trigger whose allowed source statuses the update must respect.
   */
  public static resolveCorrectionTrigger(record: RecordRowInterface): RecordTriggerEnum {
    return record.classificationStatus === RecordStatusEnum.FAILED
      ? RecordTriggerEnum.CLASSIFY_MANUALLY
      : RecordTriggerEnum.CORRECT;
  }
}
