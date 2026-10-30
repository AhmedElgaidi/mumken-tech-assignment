import { Column, DataType, Model, PrimaryKey, AutoIncrement } from "sequelize-typescript";
import { InternalIdType } from "../contracts/types/sql-db/internal-id.type";
import { PublicIdType } from "../contracts/types/sql-db/public-id.type";

/**
 * Abstract base for every domain model. Carries the dual-ID strategy: a `bigint` `id` for joins
 * and foreign keys that never leaves the server, and a `publicId` UUID that is the only id
 * clients ever see. `createdAt` / `updatedAt` / `deletedAt` are filled by the database defaults
 * (and the `Record` trigger) because rows are written with raw SQL.
 *
 * Fields use `declare` so the compiled class does not shadow Sequelize's attribute accessors
 * (the target emits class fields).
 */
export abstract class SqlBaseModel extends Model {
  /** Internal primary key; never leaves the server. */
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    comment: "Internal primary key; never leaves the server.",
  })
  declare public id: InternalIdType;

  /** External identifier (UUID) — the only id that appears in API responses and URLs. */
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    allowNull: false,
    unique: true,
    comment: "External identifier (UUID) — the only id that appears in API responses and URLs.",
  })
  declare public publicId: PublicIdType;

  /** When the row was inserted. */
  declare public createdAt: Date;

  /** When the row was last written. */
  declare public updatedAt: Date;

  /** When the row was soft-deleted; null while live. */
  declare public deletedAt: Date | null;
}
