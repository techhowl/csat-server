# Getting started

Goal: a clean clone running the full stack (api + worker + scheduler + MongoDB)
locally with live reload. The stack runs in **Docker**; secrets come from a
local **`.env`**; everyday commands go through the **Makefile**.

## Prerequisites

- **Docker** (Desktop) running.
- **Node 20+** — only for local lint/typecheck/IDE; the stack itself runs in Docker.

## 1. Clone and install

```bash
git clone <repo-url> csat-server && cd csat-server
npm install        # workspace deps, for your editor/typecheck (also: make install)
```

## 2. Secrets (.env)

Config and secrets live in a gitignored `.env` at the repo root. Every key the
app reads is documented in `.env.example`.

First time:

```bash
cp .env.example .env    # then generate JWT_*/PASSWORD_PEPPER (MONGO_URI defaults to the compose Mongo)
                        # (openssl rand -base64 48)
```

`.env` is loaded by docker compose (`env_file`) for `make dev`, by a dotenv
preload in nodemon for `npm run dev:*` on the host, and by
`vitest --mode integration` for `npm run test:integration`.

The Make targets fail fast (`check-env`) if `.env` is missing.

## 3. Run the stack

```bash
make dev     # build images if needed + start api, worker, scheduler in the foreground (live reload)
# or detached:
make up
```

The API is then at <http://localhost:4000/health>, with API docs at
<http://localhost:4000/docs>.

Source is bind-mounted into the dev containers, so **nodemon + ts-node** give
live reload — editing anything in `packages/shared/src` reloads all three
services.

| Command        | What it does                                                                             |
| -------------- | ---------------------------------------------------------------------------------------- |
| `make dev`     | Build + start all services, foreground, live reload                                      |
| `make up`      | Same, detached                                                                           |
| `make rebuild` | Like `dev` but renews the `node_modules` volume — run after adding/removing a dependency |
| `make logs`    | Tail all service logs                                                                    |
| `make ps`      | Service status                                                                           |
| `make down`    | Stop + remove containers (keeps the mongo data volume)                                   |
| `make down-v`  | Also drop the mongo data volume                                                          |

## 4. Run the checks

```bash
npm run lint           # ESLint
npm run format:check   # Prettier (use `npm run format` to fix)
npm run build          # full TypeScript build = typecheck (tsc --build)
npm run test           # Vitest unit tests
```

Integration tests need MongoDB and secrets, so they read `.env`:

```bash
npm run test:integration   # loads .env, runs vitest against the csat_test DB
```

These are the same checks CI runs — see
[Conventions → CI pipeline](conventions.md#ci-pipeline).

## Troubleshooting

- **`missing .env`** — do the first-time step in section 2.
- **`Missing required environment variable: …`** — that key is empty in `.env`.
- **New dependency not picked up** — `make rebuild` (the plain `dev` volume is stale).
