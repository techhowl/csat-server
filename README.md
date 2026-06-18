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

All three services import the **singleton** `database` from `@csat/shared`: one
Mongoose connection (and pool) per process, established once via `database.connect()`
and reused.

## Prerequisites

- Docker (Desktop) running
- Node 20+ (only needed for local lint/typecheck; the stack itself runs in Docker)
- [Infisical CLI](https://infisical.com/docs/cli/overview) — `brew install infisical/get-cli/infisical`

## Secrets (Infisical)

Secrets are **not** in `.env`. They live in our self-hosted Infisical project
(pinned in `.infisical.json`) and are fetched at boot by `infisical run`, which
wraps every service process. Each service authenticates with an `INFISICAL_TOKEN`
minted from a Machine Identity (Universal Auth).

First time:

```bash
cp .env.bootstrap.example .env.bootstrap   # fill API URL + machine identity creds (gitignored)
eval "$(make login)"                       # mints INFISICAL_TOKEN into your shell
```

## Quick start

```bash
eval "$(make login)"     # ensure INFISICAL_TOKEN + INFISICAL_API_URL are exported
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

Each prod image bundles the Infisical CLI; its `CMD` is
`infisical run --env "$INFISICAL_ENV" -- node …`. The orchestrator (Dokploy)
supplies `INFISICAL_API_URL`, `INFISICAL_TOKEN`, and `INFISICAL_ENV=prod` at
runtime — no app secrets are baked into the image or stored in the orchestrator.
