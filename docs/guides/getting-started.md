# Getting started

Goal: a clean clone running the full stack (api + worker + scheduler + MongoDB)
locally with live reload. The stack runs in **Docker**; secrets come from
**Infisical**; everyday commands go through the **Makefile**.

## Prerequisites

- **Docker** (Desktop) running.
- **Node 20+** — only for local lint/typecheck/IDE; the stack itself runs in Docker.
- **Infisical CLI** — `brew install infisical/get-cli/infisical`
  (docs: <https://infisical.com/docs/cli/overview>).

## 1. Clone and install

```bash
git clone <repo-url> csat-server && cd csat-server
npm install        # workspace deps, for your editor/typecheck (also: make install)
```

## 2. Secrets (Infisical)

Secrets are **not** in `.env`. They live in our self-hosted Infisical project
(pinned in `.infisical.json`) and are fetched at boot by `infisical run`, which
wraps every service process. You authenticate with a Machine Identity
(Universal Auth).

First time only — create your bootstrap creds file (gitignored):

```bash
cp .env.bootstrap.example .env.bootstrap   # fill API URL + machine identity client id/secret
```

Every shell session — mint a token and export it:

```bash
eval "$(make login)"   # exports INFISICAL_API_URL, INFISICAL_PROJECT_ID, INFISICAL_TOKEN
```

`make login` reads `.env.bootstrap`, logs in via Universal Auth, and prints the
`export` lines so `eval` lands them in your shell. The Make targets fail fast
(`check-token`) if the token isn't exported.

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

Integration tests need MongoDB and secrets, so they go through Infisical:

```bash
npm run test:integration   # infisical run … vitest against a test DB
```

These are the same checks CI runs — see
[Conventions → CI pipeline](conventions.md#ci-pipeline).

## Troubleshooting

- **`INFISICAL_TOKEN unset`** — run `eval "$(make login)"` in this shell.
- **`missing .env.bootstrap`** — do the first-time step in section 2.
- **New dependency not picked up** — `make rebuild` (the plain `dev` volume is stale).
