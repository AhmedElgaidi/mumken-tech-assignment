import { HttpStatus, Injectable } from "@nestjs/common";
import { Transaction } from "sequelize";
import { HashHelper } from "../../../infrastructure/helpers/crypto/hash.helper";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { PageInterface } from "../../../infrastructure/contracts/interfaces/http/page.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { RecordRepository } from "../../../infrastructure/repositories/record/record.repository";
import { CURSOR_FILTER_HASH_LENGTH, DEFAULT_RECORD_PAGE_SIZE } from "../constants/record-query.constant";
import { ListRecordQueryDto } from "../contracts/dtos/list-record-query.dto";
import { RecordDetailInterface } from "../contracts/interfaces/record-detail.interface";
import { RecordListItemInterface } from "../contracts/interfaces/record-list-item.interface";
import { RecordCursorHelper } from "../helpers/record-cursor.helper";
import { RecordMapperUtil } from "../utils/record-mapper.util";
import { RecordFilterService } from "./record-filter.service";

/** Reads records: a filtered keyset page, and one record with its history and attempts. */
@Injectable()
export class RecordService {
  public constructor(
    private readonly recordRepository: RecordRepository,
    private readonly recordFilterService: RecordFilterService,
  ) {}

  /**
   * Filtered keyset page, newest first. A cursor is bound to the filters it was issued for.
   *
   * Steps:
   * 1. Build the filter and its hash.
   * 2. Decode the cursor bound to these filters.
   * 3. Read one page from the repository, plus one row to know whether another page follows.
   * 4. Map the page and encode the next cursor.
   *
   * @param query - Filters, cursor and page size.
   * @returns The page and the cursor of the next one (`null` on the last page).
   * @throws ProblemException `INVALID_FILTER` for a bad filter or malformed cursor, `INVALID_CURSOR` for a cursor from other filters.
   */
  public async listRecords(query: ListRecordQueryDto): Promise<PageInterface<RecordListItemInterface>> {
    // 1. Build the filter and its hash.
    const filter = await this.recordFilterService.buildFilter(query);
    const filterHash = HashHelper.hashJson(filter).slice(0, CURSOR_FILTER_HASH_LENGTH);

    // 2. Decode the cursor bound to these filters.
    const position = query.cursor ? RecordCursorHelper.decode(query.cursor, filterHash) : null;
    const pageSize = query.limit ?? DEFAULT_RECORD_PAGE_SIZE;

    // 3. Read one page from the repository, plus one row to know whether another page follows.
    const rows = await this.recordRepository.findPage(filter, position, pageSize + 1);

    // 4. Map the page and encode the next cursor.
    const pageRows = rows.slice(0, pageSize);
    const lastRow = pageRows.at(-1);
    const hasNextPage = rows.length > pageSize && lastRow !== undefined;
    return {
      data: pageRows.map((row) => RecordMapperUtil.toListItem(row)),
      nextCursor: hasNextPage
        ? RecordCursorHelper.encode({ recordDate: lastRow.recordDate, id: lastRow.id }, filterHash)
        : null,
    };
  }

  /**
   * One record with its classification history and attempts.
   *
   * Steps:
   * 1. Load the record row.
   * 2. Fail when the record does not exist.
   * 3. Load its history and attempts.
   * 4. Map everything to the detail view.
   *
   * @param recordId - The record id.
   * @param transaction - Read inside this transaction when given.
   * @returns The record detail.
   * @throws ProblemException `NOT_FOUND` when the record does not exist.
   */
  public async getRecordDetail(recordId: string, transaction?: Transaction): Promise<RecordDetailInterface> {
    // 1. Load the record row.
    const row = await this.recordRepository.findById(recordId, transaction);

    // 2. Fail when the record does not exist.
    if (!row) {
      throw new ProblemException(HttpStatus.NOT_FOUND, ErrorCodeEnum.NOT_FOUND, `Record ${recordId} was not found`);
    }

    // 3. Load its history and attempts.
    const [history, attempts] = await Promise.all([
      this.recordRepository.findClassificationHistory(recordId, transaction),
      this.recordRepository.findAttempts(recordId, transaction),
    ]);

    // 4. Map everything to the detail view.
    return RecordMapperUtil.toDetail(row, history, attempts);
  }
}
