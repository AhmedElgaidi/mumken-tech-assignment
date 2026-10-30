import { HttpStatus, Injectable } from "@nestjs/common";
import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ClassificationRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-row.interface";
import { RecordRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { RecordRepository } from "../../../infrastructure/repositories/record/record.repository";
import { RecordService } from "../../record/services/record.service";

/** Reads the record under review: locks it, finds its current classification and builds conflict answers. */
@Injectable()
export class ReviewRecordService {
  public constructor(
    private readonly recordRepository: RecordRepository,
    private readonly recordService: RecordService,
  ) {}

  /**
   * Loads a record and locks its row until the transaction ends.
   *
   * Steps:
   * 1. Load the record under a row lock.
   * 2. Throw when the record does not exist.
   * 3. Return the locked record.
   *
   * @param recordId - The record's public id.
   * @param transaction - The open transaction that holds the lock.
   * @returns The locked record.
   * @throws ProblemException `NOT_FOUND` when the record does not exist.
   */
  public async lockRecord(recordId: string, transaction: Transaction): Promise<RecordRowInterface> {
    // 1. Load the record under a row lock.
    const record = await this.recordRepository.findById(recordId, transaction, true);

    // 2. Throw when the record does not exist.
    if (!record) {
      throw new ProblemException(HttpStatus.NOT_FOUND, ErrorCodeEnum.NOT_FOUND, `Record ${recordId} was not found`);
    }

    // 3. Return the locked record.
    return record;
  }

  /**
   * Finds the classification row the record currently points at.
   *
   * Steps:
   * 1. Return nothing when the record has no current classification.
   * 2. Load the classification history of the record.
   * 3. Return the current row from the history.
   *
   * @param record - The record to look at.
   * @param transaction - The open transaction.
   * @returns The current classification row, or `null` when there is none.
   */
  public async findCurrentClassification(
    record: RecordRowInterface,
    transaction: Transaction,
  ): Promise<ClassificationRowInterface | null> {
    // 1. Return nothing when the record has no current classification.
    if (!record.currentClassificationId) {
      return null;
    }

    // 2. Load the classification history of the record.
    const history = await this.recordRepository.findClassificationHistory(record.id, transaction);

    // 3. Return the current row from the history.
    return history.find((classification) => classification.id === record.currentClassificationId) ?? null;
  }

  /**
   * Builds a `409` answer that carries the record as it is now.
   *
   * @param errorCode - The conflict code.
   * @param detail - What is wrong, for the reviewer.
   * @param recordId - The record's public id.
   * @param transaction - The open transaction to read the record in.
   * @returns The exception to throw.
   */
  public async createConflictException(
    errorCode: ErrorCodeEnum,
    detail: string,
    recordId: string,
    transaction: Transaction,
  ): Promise<ProblemException> {
    return new ProblemException(HttpStatus.CONFLICT, errorCode, detail, {
      current: await this.recordService.getRecordDetail(recordId, transaction),
    });
  }
}
