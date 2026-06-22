# @csat/api

The HTTP service — Express + Helmet. Layered **routes → controllers → services →
models**. Self-documents via OpenAPI at `/docs`.

- Bootstrap: `src/index.ts` (DB connect, listen, graceful shutdown).
- Composition root: `src/app.ts` (middleware → routes → docs → error handling).
- Reference endpoint: `GET /health`, wired through every layer.

## Run

From the repo root (Docker + Infisical) — see
[Getting started](../../docs/guides/getting-started.md):

```bash
eval "$(make login)"
make dev          # all services; API at http://localhost:4000
```

- Health: <http://localhost:4000/health>
- API docs (Swagger UI): <http://localhost:4000/docs>
- Raw OpenAPI: <http://localhost:4000/openapi.json>

## More

- [API layer](../../docs/architecture/api.md) — layering rules + how to add an endpoint.
- [Architecture overview](../../docs/architecture/overview.md).
