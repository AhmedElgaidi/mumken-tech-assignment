import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { PageInterface } from "../../../infrastructure/contracts/interfaces/http/page.interface";
import { ListRecordQueryDto } from "../contracts/dtos/list-record-query.dto";
import { RecordDetailInterface } from "../contracts/interfaces/record-detail.interface";
import { RecordListItemInterface } from "../contracts/interfaces/record-list-item.interface";
import { RecordService } from "../services/record.service";

/**
 * Read access to records and their classification history.
 *
 * @route /records (api)
 */
@Controller("records")
export class RecordController {
  public constructor(private readonly recordService: RecordService) {}

  /**
   * List records, filtered and cursor-paginated, newest date first.
   * `status=NEEDS_REVIEW` is the review queue.
   *
   * @route GET /records
   *
   * @param query - Filters and the pagination window.
   * @returns One page of records.
   */
  @Get()
  public async listRecords(@Query() query: ListRecordQueryDto): Promise<PageInterface<RecordListItemInterface>> {
    return this.recordService.listRecords(query);
  }

  /**
   * Fetch a record with its current and original classification, full history and attempts.
   *
   * @route GET /records/:id
   *
   * @param id - The record's public id.
   * @returns The record detail.
   */
  @Get(":id")
  public async getRecord(@Param("id", ParseUUIDPipe) id: string): Promise<RecordDetailInterface> {
    return this.recordService.getRecordDetail(id);
  }
}
