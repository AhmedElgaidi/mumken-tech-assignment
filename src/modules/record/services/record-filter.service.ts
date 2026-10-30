import { Injectable } from "@nestjs/common";
import { RecordFilterInterface } from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { CategoryService } from "../../category/services/category.service";
import { RecordIdentityUtil } from "../../import/utils/record-identity.util";
import { ListRecordQueryDto } from "../contracts/dtos/list-record-query.dto";
import { RecordFilterHelper } from "../helpers/record-filter.helper";

/** Turns the record list query into a repository filter, refusing values the repository would not understand. */
@Injectable()
export class RecordFilterService {
  public constructor(private readonly categoryService: CategoryService) {}

  /**
   * Builds the filter. Validation runs in this order, so the first bad filter is the one reported.
   *
   * Steps:
   * 1. Resolve the source key
   * 2. Resolve the import
   * 3. Resolve the category
   * 4. Resolve the statuses
   * 5. Resolve the date range
   * 6. Resolve the title search
   *
   * @param query - The list query.
   * @returns The filter; only the parts the caller sent are set.
   * @throws ProblemException `INVALID_FILTER` for an unknown category or status, a bad date or a reversed range.
   */
  public async buildFilter(query: ListRecordQueryDto): Promise<RecordFilterInterface> {
    const filter: RecordFilterInterface = {};
    // 1. Resolve the source key
    if (query.source !== undefined) {
      filter.sourceKey = RecordIdentityUtil.getSourceKey(query.source);
    }
    // 2. Resolve the import
    if (query.importId !== undefined) {
      filter.importId = query.importId;
    }
    // 3. Resolve the category
    if (query.category !== undefined) {
      filter.category = await this.resolveCategory(query.category);
    }
    // 4. Resolve the statuses
    if (query.status !== undefined) {
      filter.statuses = RecordFilterHelper.parseStatuses(query.status);
    }
    // 5. Resolve the date range
    Object.assign(filter, RecordFilterHelper.parseDateRange(query));
    // 6. Resolve the title search
    const titlePattern = query.q === undefined ? undefined : RecordFilterHelper.toTitlePattern(query.q);
    if (titlePattern !== undefined) {
      filter.titleLike = titlePattern;
    }
    return filter;
  }

  /**
   * Checks the category against the known codes.
   *
   * Steps:
   * 1. Normalise the category code.
   * 2. Fail when the code is unknown.
   * 3. Return the normalised code.
   *
   * @param categoryText - The category sent by the caller.
   * @returns The lower-case category code.
   * @throws ProblemException `INVALID_FILTER` for an unknown category.
   */
  private async resolveCategory(categoryText: string): Promise<string> {
    // 1. Normalise the category code.
    const categoryCode = categoryText.trim().toLowerCase();

    // 2. Fail when the code is unknown.
    if (!(await this.categoryService.getCodes()).has(categoryCode)) {
      throw RecordFilterHelper.createInvalidFilterException(`Unknown category "${categoryText}"; see GET /categories`);
    }

    // 3. Return the normalised code.
    return categoryCode;
  }
}
