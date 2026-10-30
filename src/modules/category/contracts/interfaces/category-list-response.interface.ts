import { CategoryInterface } from "../../../../infrastructure/contracts/interfaces/sql-db/category/category.interface";

/** Body of `GET /categories`. */
export interface CategoryListResponseInterface {
  /** Every allowed category. */
  data: CategoryInterface[];
}
