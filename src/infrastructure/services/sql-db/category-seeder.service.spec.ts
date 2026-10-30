import { CategorySeederService } from "./category-seeder.service";
import { CATEGORIES } from "../../constants/sql-db/category.constant";
import { CategoryRepository } from "../../repositories/category/category.repository";

describe("CategorySeederService", () => {
  const build = (): { service: CategorySeederService; insertMissing: jest.Mock } => {
    const insertMissing = jest.fn().mockResolvedValue(undefined);
    const service = new CategorySeederService({ insertMissing } as unknown as CategoryRepository);
    return { service, insertMissing };
  };

  it("inserts the closed category list through the repository", async () => {
    const { service, insertMissing } = build();

    await service.seed();

    expect(insertMissing).toHaveBeenCalledWith(CATEGORIES);
  });

  it("seeds the same list at application bootstrap", async () => {
    const { service, insertMissing } = build();

    await service.onApplicationBootstrap();

    expect(insertMissing).toHaveBeenCalledWith(CATEGORIES);
  });

  it("passes a repository failure on", async () => {
    const { service, insertMissing } = build();
    insertMissing.mockRejectedValue(new Error("db down"));

    await expect(service.seed()).rejects.toThrow("db down");
  });
});
