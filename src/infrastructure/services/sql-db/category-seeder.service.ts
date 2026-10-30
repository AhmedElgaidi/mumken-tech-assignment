import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { CategoryRepository } from "../../repositories/category/category.repository";
import { CATEGORIES } from "../../constants/sql-db/category.constant";

/**
 * Seeds the closed category list at boot. Every process that imports `SqlDbModule` (the API,
 * the worker, the tests) runs it, so the rows exist wherever the code runs. It is idempotent:
 * existing codes are left as they are.
 */
@Injectable()
export class CategorySeederService implements OnApplicationBootstrap {
  public constructor(private readonly categoryRepository: CategoryRepository) {}

  /** Nest lifecycle hook: inserts the categories once the connection is up. */
  public async onApplicationBootstrap(): Promise<void> {
    await this.seed();
  }

  /**
   * Inserts every category from the contract; a code that already exists is skipped.
   *
   * @returns Resolves when the insert has finished.
   */
  public async seed(): Promise<void> {
    await this.categoryRepository.insertMissing(CATEGORIES);
  }
}
