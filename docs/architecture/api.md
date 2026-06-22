# API layer (`@csat/api`)

The `api` service is an Express app, layered so each concern has one home. Adding
a feature means following the same shape `GET /health` already demonstrates.

## Layering

```
services/api/src/
  index.ts           bootstrap — database.connect(), listen, graceful shutdown
  app.ts             composition root — middleware → routes → docs → error handling
  routes/            HTTP paths → controller handlers (index.ts aggregates them)
  controllers/       request/response boundary — parse input, call a service, shape the response
  services/          business logic, transport-agnostic (no req/res, no Express)
  models/            Mongoose models, one per collection (empty for now)
  middlewares/       cross-cutting: not-found (404), error-handler (centralised)
  docs/openapi.ts    the service's own OpenAPI document (base def + JSDoc glob)
```

The rule: a layer only calls the layer directly below it. Controllers never
touch Mongoose; services never see `req`/`res`. This keeps business logic
testable without HTTP and lets the transport change without rewriting logic.

## Composition root

[`app.ts`](../../services/api/src/app.ts) assembles the app in order:

1. `trust proxy` + disable `x-powered-by` (behind Traefik/Cloudflare).
2. `helmet()` — baseline security headers.
3. Bounded body parsing (`express.json`/`urlencoded`, 100 kb cap).
4. Feature routes, mounted through the root router aggregator (`routes/index.ts`).
5. `mountDocs(app, apiSpec)` — Swagger UI + raw spec (must come **before** the 404).
6. `notFound` then `errorHandler` — always last.

[`index.ts`](../../services/api/src/index.ts) connects the database, starts
listening, and wires graceful shutdown.

## Adding an endpoint

Follow the `health` example end to end:

1. **Service** — put the logic in `services/<feature>.ts` (pure, no HTTP).
   Reference: `services/api/src/services/health.ts`.
2. **Controller** — `controllers/<feature>.ts` calls the service and shapes the
   HTTP response. Reference: `controllers/health.ts`.
3. **Route** — wire the path in `routes/<feature>.ts` and aggregate it in
   `routes/index.ts`. Reference: `routes/health.ts`.
4. **Model** — if it persists, add a Mongoose model in `models/`.
5. **Docs** — add an `@openapi` JSDoc block above the route handler, and any
   reusable schema to the `components.schemas` in `docs/openapi.ts`.

## OpenAPI / Swagger — already built in

The API self-documents. **Don't duplicate endpoint docs in Markdown** — keep them
in the spec so they stay in sync with the code.

- The spec is assembled in
  [`services/api/src/docs/openapi.ts`](../../services/api/src/docs/openapi.ts):
  a typed base `definition` (info, servers, reusable `components.schemas`) plus
  per-endpoint operations picked up from `@openapi` JSDoc blocks on the route
  files via [`buildOpenApiSpec`](../../packages/http/src/docs.ts).
- It's mounted by `mountDocs` from `@csat/http`:
  - **Swagger UI** → `GET /docs`
  - **Raw spec (JSON)** → `GET /openapi.json`

When running locally: <http://localhost:4000/docs>.

> Keep `removeComments` off in `tsconfig` — swagger-jsdoc reads the `@openapi`
> comments at runtime from the compiled output, so they must survive the build.
