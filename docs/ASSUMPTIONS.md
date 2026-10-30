# Assumptions

1. A record's identity is `(source, externalId)`. The same `externalId` from two sources is two records.
2. `source` is compared case-insensitively after trimming (`"Gov-News "` = `"gov-news"`). The original value is stored for display. `externalId` is trimmed but stays case-sensitive.
3. A re-submitted `(source, externalId)` is reported as a **duplicate** and not modified, even if its content changed. The response flags `hasContentChanged: true` when the content hash (title, description, date) differs. Updating on re-import is a listed improvement.
4. All five fields are required. Limits: `externalId` 255, `title` 500, `description` 5,000, `source` 100 characters.
5. The date is a date (`2026-10-25`, read as 00:00 UTC) or a date-time **with an offset** (`2026-10-25T09:00:00+03:00`). A date-time without an offset is ambiguous and rejected. Impossible dates (`2026-02-30`) are rejected. Accepted range: 1900-01-01 to five years from now (effective dates may be in the future). Stored in UTC.
6. A batch has 1 to 500 records and at most 10 MB (both configurable). Worst case: 500 × (5,000 + 500 + 255 + 100) characters × 2 bytes ≈ 5.9 MB, under the limit. Bigger imports are split by the client.
7. Validation is synchronous; classification is asynchronous. The import returns `202` once records are stored and jobs are enqueued.
8. Categories are a fixed list seeded on startup by an in-process seeder (not a migration; re-running it changes nothing): `economy`, `health`, `education`, `technology`, `legal`, `sports`, `culture`, `other`.
9. Confidence below `classification.reviewThreshold` (0.7) means "needs manual review". The automatic category is still stored and visible.
10. A correction resolves a review; an approval keeps the automatic category and resolves it. A person may also classify a `FAILED` record by hand.
11. No authentication is required. An optional `X-API-Key` check exists (off when `API_KEY` is empty). The reviewer's name comes in the body as `reviewedBy`.
12. Single tenant, single region.
13. Classifier failures are **transient** (retried with backoff), **permanent** (failed at once) or **unknown** (treated as transient). After `classification.maxAttempts` (5) a transient failure becomes `FAILED` / `TRANSIENT_EXHAUSTED`.
14. "Recover" means re-queuing `FAILED` records that can succeed (`TRANSIENT_EXHAUSTED`; `PERMANENT` only with `isForced: true`), or classifying them by hand. Invalid items are not stored as records, only as import items with their errors; the client fixes and re-submits them, and records already stored come back as duplicates.
15. Unknown extra fields on a record are ignored and reported as warnings.
16. Duplicates are not import issues: an import with only valid and duplicate items can be `COMPLETED`.
17. Import status is live: it can change after completion (an approval, a retry).
18. `Idempotency-Key` is optional and kept for the life of its import (no expiry). Reusing it with a different body is rejected.
