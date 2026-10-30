import { CategoryRepository } from "../../../infrastructure/repositories/category/category.repository";
import { CategoryService } from "./category.service";

describe("CategoryService", () => {
  const categories = [
    { code: "sports", name: "Sports" },
    { code: "politics", name: "Politics" },
  ];
  const categoryRepository = { findAll: jest.fn() };
  let service: CategoryService;

  beforeEach(() => {
    jest.resetAllMocks();
    categoryRepository.findAll.mockResolvedValue(categories);
    service = new CategoryService(categoryRepository as unknown as CategoryRepository);
  });

  it("lists categories under data", async () => {
    await expect(service.listCategories()).resolves.toEqual({ data: categories });
  });

  it("returns the codes as a set", async () => {
    await expect(service.getCodes()).resolves.toEqual(new Set(["sports", "politics"]));
  });

  it("reads the repository once across calls", async () => {
    await service.listCategories();
    await service.listCategories();
    await service.getCodes();

    expect(categoryRepository.findAll).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    categoryRepository.findAll.mockRejectedValueOnce(new Error("db down"));

    await expect(service.listCategories()).rejects.toThrow("db down");
    await expect(service.listCategories()).resolves.toEqual({ data: categories });
    expect(categoryRepository.findAll).toHaveBeenCalledTimes(2);
  });
});
