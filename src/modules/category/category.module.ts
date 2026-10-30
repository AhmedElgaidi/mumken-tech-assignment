import { Module } from "@nestjs/common";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { CategoryService } from "./services/category.service";
import { CategoryController } from "./controllers/category.controller";

/** The fixed category list, cached for the process. */
@Module({
  imports: [SqlDbModule],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
