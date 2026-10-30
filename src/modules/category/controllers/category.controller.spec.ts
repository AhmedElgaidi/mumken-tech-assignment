import { CategoryService } from "../services/category.service";
import { CategoryController } from "./category.controller";

describe("CategoryController", () => {
  it("returns the service's category list", async () => {
    const response = { data: [{ code: "sports", name: "Sports" }] };
    const categoryService = { listCategories: jest.fn().mockResolvedValue(response) };
    const controller = new CategoryController(categoryService as unknown as CategoryService);

    await expect(controller.listCategories()).resolves.toBe(response);
    expect(categoryService.listCategories).toHaveBeenCalledTimes(1);
  });
});
