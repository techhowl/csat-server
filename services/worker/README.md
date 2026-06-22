# @csat/worker

Background job processor (currently a **stub**). A standalone process that shares
the `@csat/shared` config/logger/database singleton; no HTTP surface.

Intended role: consume and process work enqueued by the
[scheduler](../scheduler/README.md) (and, later, other producers) — e.g. CSAT
survey dispatch, digest emails, cleanup jobs.

- Entry: `src/index.ts` — connects the DB, runs the job loop, graceful shutdown.
- Run with the rest of the stack via `make dev` / `make up` (see
  [Getting started](../../docs/guides/getting-started.md)).

See the [architecture overview](../../docs/architecture/overview.md).
