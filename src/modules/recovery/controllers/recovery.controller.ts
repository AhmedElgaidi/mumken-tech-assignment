import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { RequestIdDecorator } from "../../../infrastructure/decorators/request-id.decorator";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RetryDto } from "../contracts/dtos/retry.dto";
import { ImportRetryResultInterface } from "../contracts/interfaces/import-retry-result.interface";
import { RecoveryService } from "../services/recovery.service";

/**
 * Retry endpoints. A missing or empty body means `{ "isForced": false }`.
 *
 * @route / (api)
 */
@Controller()
export class RecoveryController {
  public constructor(private readonly recoveryService: RecoveryService) {}

  /**
   * Requeue the retryable FAILED records of an import; a repeat requeues none.
   *
   * @route POST /imports/:id/retry
   *
   * @param id - The import's public id.
   * @param body - Retry options.
   * @param requestId - The request id carried into logs and queue jobs.
   * @returns How many records were requeued.
   */
  @Post("imports/:id/retry")
  @HttpCode(HttpStatus.OK)
  public async retryImport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RetryDto,
    @RequestIdDecorator() requestId: string | undefined,
  ): Promise<ImportRetryResultInterface> {
    return this.recoveryService.retryImport(id, body, requestId);
  }

  /**
   * Requeue one record. Conflicts with NOTHING_TO_RECOVER (classified or in review) or
   * PERMANENT_FAILURE without `isForced`.
   *
   * @route POST /records/:id/retry
   *
   * @param id - The record's public id.
   * @param body - Retry options.
   * @param requestId - The request id carried into logs and queue jobs.
   * @returns The record, requeued or already in progress.
   */
  @Post("records/:id/retry")
  @HttpCode(HttpStatus.OK)
  public async retryRecord(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RetryDto,
    @RequestIdDecorator() requestId: string | undefined,
  ): Promise<RecordDetailInterface> {
    return this.recoveryService.retryRecord(id, body, requestId);
  }
}
