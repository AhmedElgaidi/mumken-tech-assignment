import { Controller, Get } from "@nestjs/common";
import { CategoryService } from "../services/category.service";
import { CategoryListResponseInterface } from "../contracts/interfaces/category-list-response.interface";

/**
 * The categories a classification may use.
 *
 * @route /categories (api)
 */
@Controller("categories")
export class CategoryController {
  public constructor(private readonly categoryService: CategoryService) {}

  /**
   * List every category a classification may use.
   *
   * @route GET /categories
   *
   * @returns The categories, wrapped in `data`.
   */
  @Get()
  public async listCategories(): Promise<CategoryListResponseInterface> {
    return this.categoryService.listCategories();
  }
}
