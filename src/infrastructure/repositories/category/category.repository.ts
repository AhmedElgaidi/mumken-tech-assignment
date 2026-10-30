import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import { CategoryModel } from "../../models/category.model";
import { CategoryInterface } from "../../contracts/interfaces/sql-db/category/category.interface";

/** Reads and seeds the category reference table. */
@Injectable()
export class CategoryRepository extends SqlBaseRepository {
  public constructor(
    @InjectConnection() sequelize: Sequelize,
    @InjectModel(CategoryModel) private readonly categoryModel: typeof CategoryModel,
  ) {
    super(sequelize);
  }

  /**
   * Lists every category, ordered by code.
   *
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The categories.
   */
  public async findAll(transaction?: Transaction): Promise<CategoryInterface[]> {
    const rows = await this.categoryModel.findAll({
      order: [["code", "ASC"]],
      raw: true,
      transaction,
    });
    return rows.map((row) => ({ code: row.code, name: row.name }));
  }

  /**
   * Inserts the categories; a code that already exists is left as it is.
   *
   * @param categories - The categories to insert.
   * @returns Resolves when the insert has finished.
   */
  public async insertMissing(categories: readonly CategoryInterface[]): Promise<void> {
    await this.execute(
      `INSERT INTO "Category" ("code", "name")
       SELECT code, name FROM unnest($1::text[], $2::text[]) AS c(code, name)
       ON CONFLICT ("code") DO NOTHING`,
      [categories.map((category) => category.code), categories.map((category) => category.name)],
    );
  }
}
