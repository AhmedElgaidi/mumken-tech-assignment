import { AllowNull, Column, DataType, Table } from "sequelize-typescript";
import { SqlBaseModel } from "./sql-base.model";

/** The closed list of topics a record can be classified into (reference data, seeded at boot). */
@Table({
  tableName: "Category",
  comment: "One topic a record can be classified into.",
  indexes: [{ fields: ["code"], name: "category_code_uniq", unique: true }],
})
export class CategoryModel extends SqlBaseModel {
  /** Stable lowercase slug other tables reference; never renamed. */
  @AllowNull(false)
  @Column({
    type: DataType.STRING(50),
    comment: "Stable lowercase slug other tables reference (`economy`, `health`, …); never renamed.",
  })
  declare public code: string;

  /** Human-readable label shown to reviewers. */
  @AllowNull(false)
  @Column({ type: DataType.STRING(100), comment: "Human-readable label shown to reviewers." })
  declare public name: string;
}
