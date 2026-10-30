import { AllowNull, Column, DataType, Table } from "sequelize-typescript";
import { AttemptOutcomeEnum } from "../../modules/classification/contracts/enums/lifecycle/attempt-outcome.enum";
import { SqlBaseModel } from "./sql-base.model";
import { InternalIdType } from "../contracts/types/sql-db/internal-id.type";

/** One try by a worker to classify a record, successful or not. */
@Table({
  tableName: "ClassificationAttempt",
  comment: "One classification attempt made by a worker on a record.",
  indexes: [
    {
      fields: ["recordId", "retryGeneration", "attemptNo"],
      name: "classification_attempt_record_generation_no_uniq",
      unique: true,
    },
  ],
})
export class ClassificationAttemptModel extends SqlBaseModel {
  /** Internal id of the record that was being classified. */
  @AllowNull(false)
  @Column({ type: DataType.BIGINT, comment: "The record that was being classified." })
  declare public recordId: InternalIdType;

  /** The record's retry generation when the attempt ran. */
  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
    comment: "The record's retry generation when the attempt ran.",
  })
  declare public retryGeneration: number;

  /** Position of the attempt within its retry generation, starting at 1. */
  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
    comment: "Position of the attempt within its retry generation, starting at 1.",
  })
  declare public attemptNo: number;

  /** How the attempt ended. */
  @AllowNull(false)
  @Column({ type: DataType.STRING(30), comment: "How the attempt ended (AttemptOutcomeEnum)." })
  declare public outcome: AttemptOutcomeEnum;

  /** Error message of a failed attempt. */
  @AllowNull(true)
  @Column({
    type: DataType.TEXT,
    comment: "Error message of a failed attempt, cut to 2000 characters; null on success.",
  })
  declare public error: string | null;

  /** How long the classifier call took, in milliseconds. */
  @AllowNull(true)
  @Column({
    type: DataType.INTEGER,
    comment: "How long the classifier call took, in milliseconds.",
  })
  declare public durationMs: number | null;
}
