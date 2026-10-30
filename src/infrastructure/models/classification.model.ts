import { AllowNull, Column, DataType, Table } from "sequelize-typescript";
import { Op } from "sequelize";
import { ClassificationKindEnum } from "../../modules/classification/contracts/enums/lifecycle/classification-kind.enum";
import { SqlBaseModel } from "./sql-base.model";
import { InternalIdType } from "../contracts/types/sql-db/internal-id.type";

/** Read model only: rows are inserted with SQL and never updated (a trigger blocks it). */
@Table({
  tableName: "Classification",
  comment: "One append-only classification result for a record.",
  indexes: [
    { fields: ["id", "recordId"], name: "classification_id_record_id_uniq", unique: true },
    { fields: ["recordId", "createdAt"], name: "classification_record_id_created_at_idx" },
    {
      fields: ["recordId"],
      name: "classification_record_id_automatic_uniq",
      unique: true,
      where: { kind: ClassificationKindEnum.AUTOMATIC },
    },
    { fields: ["categoryCode"], name: "classification_category_code_idx" },
    {
      fields: ["supersedesId"],
      name: "classification_supersedes_id_idx",
      where: { supersedesId: { [Op.ne]: null } },
    },
  ],
})
export class ClassificationModel extends SqlBaseModel {
  /** Internal id of the record this result is about. */
  @AllowNull(false)
  @Column({ type: DataType.BIGINT, comment: "The record this result is about." })
  declare public recordId: InternalIdType;

  /** How the result was produced. */
  @AllowNull(false)
  @Column({
    type: DataType.STRING(30),
    comment: "How the result was produced (ClassificationKindEnum).",
  })
  declare public kind: ClassificationKindEnum;

  /** The category the result assigns. */
  @AllowNull(false)
  @Column({ type: DataType.STRING(50), comment: "The category the result assigns." })
  declare public categoryCode: string;

  /** `numeric` comes back from pg as a string; the mapper parses it. */
  @AllowNull(true)
  @Column({
    type: DataType.DECIMAL(4, 3),
    comment: "Classifier confidence from 0 to 1; set for AUTOMATIC results, null for manual ones.",
  })
  declare public confidence: string | null;

  /** Whether a human must look at the result before it is trusted. */
  @AllowNull(false)
  @Column({
    type: DataType.BOOLEAN,
    comment: "Whether a human must look at the result before it is trusted.",
  })
  declare public isReviewNeeded: boolean;

  /** Name and version of the classifier that produced an AUTOMATIC result. */
  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
    comment: "Name and version of the classifier that produced an AUTOMATIC result.",
  })
  declare public classifier: string | null;

  /** The classifier response as received. */
  @AllowNull(true)
  @Column({
    type: DataType.JSONB,
    comment: "The classifier response as received, kept for audit.",
  })
  declare public rawOutput: unknown;

  /** Why a reviewer changed the category. */
  @AllowNull(true)
  @Column({
    type: DataType.STRING(500),
    comment: "Why a reviewer changed the category; required for MANUAL_CORRECTION.",
  })
  declare public reason: string | null;

  /** Name of the reviewer for manual results. */
  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
    comment: "Name of the reviewer for manual results; null for AUTOMATIC ones.",
  })
  declare public reviewedBy: string | null;

  /** Internal id of the earlier classification this one replaces. */
  @AllowNull(true)
  @Column({
    type: DataType.BIGINT,
    comment: "The earlier classification this one replaces; null for the first result.",
  })
  declare public supersedesId: InternalIdType | null;
}
