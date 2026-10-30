import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JsonContentTypeGuard } from "../../../infrastructure/guards/json-content-type.guard";
import { RequestIdDecorator } from "../../../infrastructure/decorators/request-id.decorator";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { PageInterface } from "../../../infrastructure/contracts/interfaces/http/page.interface";
import { CreateImportDto } from "../contracts/dtos/create-import.dto";
import { ListImportItemQueryDto } from "../contracts/dtos/list-import-item-query.dto";
import { ImportDetailResponseInterface } from "../contracts/interfaces/response/import-detail-response.interface";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportService } from "../services/import.service";
import { ImportItemRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { IDEMPOTENCY_KEY_HEADER } from "../constants/idempotency-header.constant";

/**
 * Bulk import submission and its progress.
 *
 * @route /imports (api)
 */
@Controller("imports")
export class ImportController {
  public constructor(private readonly importService: ImportService) {}

  /**
   * Store an import; valid records are classified in the background, invalid and duplicate
   * items are listed. The same idempotency key with the same body replays the first result,
   * marked `Idempotent-Replayed: true` by the response interceptor.
   *
   * @route POST /imports
   *
   * @param body - The records to import.
   * @param requestId - The request id carried into logs and queue jobs.
   * @param idempotencyKey - Optional client key, at most `IDEMPOTENCY_KEY_MAX_LENGTH` characters.
   * @returns The stored import with its per-item outcomes, flagged when it is a replay.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JsonContentTypeGuard)
  public async submitImport(
    @Body() body: CreateImportDto,
    @RequestIdDecorator() requestId: string | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<ServiceResultInterface<SubmitImportResponseInterface>> {
    return this.importService.submit(body.records, idempotencyKey, requestId);
  }

  /**
   * Fetch the live status, counts and progress of an import.
   *
   * @route GET /imports/:id
   *
   * @param id - The import's public id.
   * @returns The import detail.
   */
  @Get(":id")
  public async getImport(@Param("id", ParseUUIDPipe) id: string): Promise<ImportDetailResponseInterface> {
    return this.importService.get(id);
  }

  /**
   * List per-item outcomes, errors and warnings, in submission order.
   *
   * @route GET /imports/:id/items
   *
   * @param id - The import's public id.
   * @param query - Outcome filter and the pagination window.
   * @returns One page of import items.
   */
  @Get(":id/items")
  public async listImportItems(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ListImportItemQueryDto,
  ): Promise<PageInterface<ImportItemRowInterface>> {
    return this.importService.listItems(id, query);
  }
}
