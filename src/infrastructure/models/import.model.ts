import { AllowNull, Column, DataType, Table } from "sequelize-typescript";
import { SqlBaseModel } from "./sql-base.model";

/** One import request: the batch envelope that owns its items and records. */
@Table({
  tableName: "Import",
  comment: "One import request: a batch of raw records submitted together.",
  indexes: [{ fields: ["idempotencyKey"], name: "import_idempotency_key_uniq", unique: true }],
})
export class ImportModel extends SqlBaseModel {
  /** Client-supplied `Idempotency-Key`; null when none was sent. */
  @AllowNull(true)
  @Column({
    type: DataType.STRING(255),
    comment: "Client-supplied `Idempotency-Key`, kept for the life of the import (no expiry); null when none was sent.",
  })
  declare public idempotencyKey: string | null;

  /** SHA-256 hex of the raw records array as canonical JSON. */
  @AllowNull(true)
  @Column({
    type: DataType.STRING(64),
    comment: "SHA-256 hex of the raw records array as canonical JSON; a replay with a different body is refused.",
  })
  declare public requestHash: string | null;

  /** How many items the request carried, valid or not. */
  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
    comment: "How many items the request carried, valid or not.",
  })
  declare public totalItems: number;
}
