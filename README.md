# csat-server

Service-based TypeScript backend (npm workspaces monorepo). Built to scale into
the Howl tech architecture: independent `api`, `worker`, and `scheduler` services
sharing one MongoDB connection and a common logger/config.

## Layout

```
packages/
  shared/        @csat/shared — config, winston logger, Mongo singleton (reused everywhere)
services/
  api/           @csat/api — Express + Helmet, GET /health
  worker/        @csat/worker — background job loop (stub)
  scheduler/     @csat/scheduler — cron-style tick loop (stub)
```

The `api` service is layered **routes → controllers → services → models**. A
request lands on a route (path → handler wiring), the controller handles the
HTTP request/response, the service holds business logic (transport-agnostic),
and models own persistence (Mongoose). `GET /health` is wired through this
flow as the reference example; add a feature by following the same shape.

```
services/api/src/
  app.ts             composition root — middleware + routes + error handling
  index.ts           bootstrap — DB connect, listen, graceful shutdown
  routes/            HTTP paths → controller handlers (index.ts aggregates)
  controllers/       request/response boundary, no business logic
  services/          business logic, no HTTP knowledge
  models/            Mongoose models (one per collection) — empty for now
  middlewares/       cross-cutting (404, centralised error handler)
```

All three services import the **singleton** `database` from `@csat/shared`: one
Mongoose connection (and pool) per process, established once via `database.connect()`
and reused.

## Prerequisites

- Docker (Desktop) running
- Node 20+ (only needed for local lint/typecheck; the stack itself runs in Docker)

## Secrets (.env)

Config and secrets live in a gitignored `.env` at the repo root. Every key the
app reads is documented in `.env.example`.

First time:

```bash
cp .env.example .env    # then fill MONGO_URI and generate JWT_*/PASSWORD_PEPPER
                        # (openssl rand -base64 48)
```

`.env` is loaded by docker compose (`env_file`) for `make dev`, by a dotenv
preload in nodemon for `npm run dev:*` on the host, and by
`vitest --mode integration` for `npm run test:integration`.

## Quick start

```bash
make dev                 # build + start api, worker, scheduler (foreground, live reload)
# ... or detached:
make up
```

API: http://localhost:4000/health

```bash
make down      # stop + remove containers (keeps mongo data volume)
make down-v    # also drop the mongo volume
make logs      # tail all service logs
make ps        # status
```

## Local tooling (no Docker)

```bash
npm install
npm run lint
npm run build      # full TypeScript build (typecheck)
```

## Dev model

- Source is bind-mounted into the dev containers; **nodemon + ts-node** give live
  reload. Editing anything in `packages/shared/src` reloads all three services.
- Dev resolves `@csat/shared` from source (via `tsconfig.dev.json` paths); the
  production Dockerfiles compile to `dist` and run plain `node`.

## Production images

Each service has its own multi-stage `Dockerfile` (`services/*/Dockerfile`) —
one image per service, ready for the CI build/scan/push stage. Runs as the
unprivileged `node` user.

Each prod image's `CMD` is plain `node …`. The orchestrator (Dokploy) supplies
the env vars documented in `.env.example` at runtime (or locally:
`docker run --env-file .env …`) — no secrets are baked into the image.
