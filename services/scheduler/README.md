# @csat/scheduler

Cron-style tick loop (currently a **stub**). A standalone process that shares the
`@csat/shared` config/logger/database singleton; no HTTP surface.

Intended role: on each tick, evaluate due schedules and enqueue work for the
[worker](../worker/README.md) — e.g. survey dispatch, digest emails, cleanup.
Ticks are **single-flight**, so a long-running schedule never stacks on the next
tick. Real schedules will likely register via `node-cron` later.

- Entry: `src/index.ts` — connects the DB, runs `setInterval` ticks
  (`config.scheduler.tickIntervalMs`), graceful shutdown.
- Run with the rest of the stack via `make dev` / `make up` (see
  [Getting started](../../docs/guides/getting-started.md)).

See the [architecture overview](../../docs/architecture/overview.md).
