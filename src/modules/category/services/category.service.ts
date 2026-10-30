import { Injectable } from "@nestjs/common";
import { CategoryInterface } from "../../../infrastructure/contracts/interfaces/sql-db/category/category.interface";
import { CategoryRepository } from "../../../infrastructure/repositories/category/category.repository";
import { CategoryListResponseInterface } from "../contracts/interfaces/category-list-response.interface";

/** Categories are a fixed list seeded at startup, so they are read once and cached for the process. */
@Injectable()
export class CategoryService {
  private cachedCategories: CategoryInterface[] | null = null;

  public constructor(private readonly categoryRepository: CategoryRepository) {}

  /**
   * Lists every category for the API.
   *
   * @returns The categories under `data`.
   */
  public async listCategories(): Promise<CategoryListResponseInterface> {
    return { data: await this.loadCategories() };
  }

  /**
   * The valid category codes.
   *
   * @returns The set of codes, for membership checks.
   */
  public async getCodes(): Promise<Set<string>> {
    return new Set((await this.loadCategories()).map((category) => category.code));
  }

  /**
   * Returns the cached categories, reading them once on the first call. A failed read is not
   * cached, so the next call tries again.
   *
   * Steps:
   * 1. Return the cache when it is filled.
   * 2. Read the categories and keep them.
   * 3. Return the categories.
   *
   * @returns The categories, from the cache after the first successful read.
   */
  private async loadCategories(): Promise<CategoryInterface[]> {
    // 1. Return the cache when it is filled.
    if (this.cachedCategories) {
      return this.cachedCategories;
    }

    // 2. Read the categories and keep them.
    const categories = await this.categoryRepository.findAll();
    this.cachedCategories = categories;

    // 3. Return the categories.
    return categories;
  }
}
