# @csat/http

Transport-layer helpers shared by HTTP services. Currently: OpenAPI spec building
and Swagger UI mounting.

## Exports

| Export                                   | What it is                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `buildOpenApiSpec(options)`              | Builds an OpenAPI document from a base `definition` + `@openapi` JSDoc globs (via swagger-jsdoc). |
| `mountDocs(app, spec)`                   | Mounts Swagger UI at `/docs` and the raw spec at `/openapi.json`.                                 |
| `OpenApiSpecOptions`, `MountDocsOptions` | Supporting types.                                                                                 |

## Usage

A service owns its spec and mounts it:

```ts
import { buildOpenApiSpec, mountDocs } from "@csat/http";

const apiSpec = buildOpenApiSpec({ definition, apis });
mountDocs(app, apiSpec); // before the 404 handler
```

Reference wiring: `services/api/src/docs/openapi.ts` + `services/api/src/app.ts`.
See [API layer](../../docs/architecture/api.md).
