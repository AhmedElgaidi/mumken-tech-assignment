# Technical decisions

Each entry: the decision, why, and the alternative considered.

## Requirements → decisions

| #   | Requirement                       | How it is built                                                                  | Decision |
| --- | --------------------------------- | -------------------------------------------------------------------------------- | -------- |
| R1  | Submit multiple records           | 1–500 items / 10 MB, one transaction, `202`                                      | D2, D3   |
| R2  | Invalid records with feedback     | per-item validation, partial success, `{field, code, message}`                   | D3       |
| R3  | No duplicates                     | in-batch map, unique `(sourceKey, externalId)`, `ON CONFLICT`, `Idempotency-Key` | D7       |
| R4  | Progress and outcome              | counts derived on read, status from a truth table                                | D5       |
| R5  | Retrieve and filter               | filters, keyset pagination, indexes                                              | D6       |
| R6  | One record and its classification | current + original + history + attempts                                          | D4       |
| R7  | Manual review                     | confidence threshold, unknown category                                           | A9       |
| R8  | Correct, keep the original        | append-only rows, `supersedesId`, trigger, optimistic check                      | D4       |
| R9  | Recover without repeating work    | failure kinds, retry generations, leases, one automatic row, sweeper             | D2, D8   |

A9 = [assumption 9](ASSUMPTIONS.md). Tests for each requirement: the e2e `describe` named after it (`R1`–`R9`), plus the integration tests for races, the worker, the sweeper and Redis down.

## D1. NestJS

**Decision:** NestJS 11 on Node 22, TypeScript strict.
**Why:** modules and dependency injection give clear boundaries (imports, records, review, recovery, classification) and let tests swap the classifier with one `overrideProvider`. Pipes, guards and filters give one place for validation and error format. One process serves the HTTP API, the classification worker and the sweeper; feature modules sit in `src/modules/`, shared plumbing in `src/infrastructure/`.
**Alternative:** Express or Fastify with hand-wired modules: less framework, but more glue code for DI, validation and testing.

## D2. BullMQ on Redis, PostgreSQL as the source of truth, a sweeper instead of an outbox

**Decision:** classification runs on a BullMQ queue, consumed by a worker inside the same process as the API (it never blocks a request). Every state lives in PostgreSQL (`Record.classificationStatus`, leases, attempts); Redis only holds jobs. A sweeper on a separate `maintenance` queue rebuilds missing jobs from the database.
**Why:** BullMQ gives retries with exponential backoff, concurrency, stalled-job detection and job-id de-duplication. Because the database decides what still needs work, a lost queue or a failed enqueue only delays work; it never loses it.
**Alternatives:** a Postgres-only queue (`pg-boss` or `SELECT … FOR UPDATE SKIP LOCKED`) is transactional with the data and has one service fewer; a transactional outbox closes the enqueue-after-commit gap. Both are more code for this scope; the outbox is listed as an improvement.

## D3. Per-item validation with partial success

**Decision:** the global `ValidationPipe` checks only the envelope (`records` is a non-empty array). Each item is then validated on its own with class-validator. Valid items are stored, invalid ones are reported with `{ field, code, message }` and kept in `ImportItem`.
**Why:** one bad record in a batch from an external source must not block 499 good ones. One error per field (the most basic one) tells the client what to fix first; every field is reported at once.
**Alternative:** reject the whole batch on any error: simpler, but forces the client to resend everything.

## D4. Append-only classifications, enforced by the database

**Decision:** `Classification` is insert-only. Approvals and corrections add rows with `supersedesId`; the record points at the current row. A trigger blocks `UPDATE` and `DELETE`; a partial unique index allows one `AUTOMATIC` row per record; a composite foreign key stops a record pointing at another record's row.
**Why:** "preserve the original result" becomes a database guarantee, not a convention. History and the original are a simple query.
**Alternative:** columns `originalCategory` / `correctedCategory` on the record: simpler, but loses history after a second correction.

## D5. Derived import progress and live status

**Decision:** counts and status are computed on read from `ImportItem` and the records the import created (two grouped queries). Status follows a truth table and can change after completion (an approval, a retry).
**Why:** always correct, no counters to drift under retries and races.
**Alternative:** counters updated by the worker: faster for huge imports, but every path must keep them right. Worth it past roughly 10⁵ records per import.

## D6. Keyset pagination with one sort

**Decision:** `GET /records` sorts by `(recordDate DESC, id DESC)` and pages with an opaque cursor containing the last key and a hash of the filters.
**Why:** stable pages while records are being added, index-backed (`record_date_id_idx`), and a cursor reused with other filters is rejected instead of returning a wrong page.
**Alternative:** `offset/limit`: simpler, but slow on deep pages and skips or repeats rows during inserts.

## D7. Identity `(sourceKey, externalId)`; changed content is reported, not updated

**Decision:** a unique constraint on `(lower(trim(source)), externalId)`. Inserts use `INSERT … ON CONFLICT DO NOTHING RETURNING`, so concurrent imports are safe without locks taken in code. Rows are sorted by key before the insert so concurrent imports lock keys in one order (and the transaction is retried once on a deadlock). A duplicate whose content hash differs is flagged `hasContentChanged: true`.
**Why:** the database is the only reliable place to prevent duplicates under concurrency. Silently overwriting would lose the classification of the stored record.
**Alternative:** upsert and re-classify on change: needs record versioning; listed as an improvement.

## D8. Recovery model: leases, retry generations, failure kinds

**Decision:**

- A worker **claims** a record (takes exclusive ownership of it) with one conditional `UPDATE` (status `PENDING`, or `PROCESSING` with an expired lease) that sets a lease token and counts the attempt. Every later write checks the token, so a worker that lost its lease cannot overwrite the new owner.
- The database `attemptCount` is the only attempt counter; BullMQ's `attempts` is a safety net above it.
- Failures are `TRANSIENT_EXHAUSTED` or `PERMANENT`. Retry endpoints move only retryable `FAILED` records back to `PENDING` in a new **retry generation** (new job id, fresh attempt budget, history kept). `CLASSIFIED` and `NEEDS_REVIEW` are never sent back to the classifier. A second retry call requeues nothing. A person can classify a `FAILED` record by hand.
- The lease (20 s) is longer than the classifier timeout (5 s) and shorter than BullMQ's stall check (30 s), so a re-run after a crash can claim the record at once.

**Why:** "recover without duplicating data or repeating successful work" is enforced by conditional statements and constraints, and each case has a test that counts classifier calls.
**Limit:** a crash between the classifier's answer and the save calls the classifier again; see [limitations](LIMITATIONS_SHORTCUTS_IMPROVEMENTS.md#limitations).
