# Limitations, shortcuts and improvements

## Limitations

- **No authentication model.** Only an optional shared API key; `reviewedBy` is trusted from the body.
- **Single tenant.**
- **No update on re-import.** A changed record is reported (`hasContentChanged: true`), not stored.
- **Counts are computed on read.** Two grouped queries per `GET /imports/:id`; fine for 500-item batches, costly for very large imports.
- **Enqueue happens after commit.** If Redis is down or the process dies between commit and enqueue, records wait as `PENDING` until the sweeper runs (every 60 s, after a 30 s grace period). While Redis is down each import waits up to 3 s for the enqueue to time out.
- **Crash window.** If a worker dies after the classifier answers but before the save commits, the next owner calls the classifier again. Calls are at-least-once; the saved result is exactly-once.
- **Title search has no index** (`ILIKE '%…%'`), so it scans on large tables.
- **Idempotency keys never expire.**
- **The classifier is a mock** (keyword rules).

## Shortcuts taken

- Mock classifier with keyword rules and title triggers instead of a model.
- `reviewedBy` from the request body instead of the authenticated user.
- One sort order for `GET /records` (`date DESC, id DESC`).
- Categories are a fixed list seeded on startup, no admin endpoint.
- No rate limiting, no CI pipeline.
- Raw SQL in repositories for the hot paths; Sequelize models only for simple reads.
- Bull Board (queue dashboard) was not added; queues are visible through the API and logs.
- Tuning values (timeouts, attempts, limits, queue names) are code constants in `DEFAULT_APP_SETTINGS`, changed by a deploy rather than an environment variable; `.env` holds only what differs between deployments.

## Improvements

- **Transactional outbox** for job intents, removing the enqueue-after-commit gap.
- **Save the raw classifier answer first** in its own transaction, so a crash never re-calls a paid provider.
- Idempotency-key expiry job.
- Trigram index (`pg_trgm`) for title search.
- CSV upload; async chunked ingestion for very large files (store the payload, validate and insert in background chunks).
- Record versioning on re-import.
- Real LLM adapter: structured JSON output with validation, timeouts, retries on 429, token and cost logging, prompt versioning, the model's own confidence.
- Embeddings for semantic search and near-duplicate detection.
- Per-source rate limits, multi-tenancy.
- Metrics (queue depth, success/failure rates, durations) and tracing; a Bull Board dashboard.
- CI/CD.
