import path from "node:path";
import { buildOpenApiSpec } from "@csat/http";

/**
 * The `api` service's OWN OpenAPI document.
 *
 * Base definition (info, servers, reusable component schemas) lives here as a
 * typed object; per-endpoint operations are picked up from colocated
 * `@openapi` JSDoc blocks on the route files (see `apis` glob below).
 *
 * `servers` is relative (`/`) on purpose — no `config` import — so the spec
 * stays decoupled from environment and the unit-test mock of `@csat/shared`
 * (which omits `config`) keeps working.
 */
const definition = {
  openapi: "3.0.3",
  info: {
    title: "CSAT API",
    version: "0.1.0",
    description: "HTTP API for the CSAT platform.",
  },
  servers: [{ url: "/", description: "current host" }],
  components: {
    schemas: {
      // Mirrors HealthReport in services/api/src/services/health.ts.
      HealthReport: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "degraded"] },
          service: { type: "string", example: "api" },
          uptimeSec: { type: "integer", example: 42 },
          dependencies: {
            type: "object",
            properties: {
              mongo: { type: "string", enum: ["up", "down"] },
            },
            required: ["mongo"],
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: [
          "status",
          "service",
          "uptimeSec",
          "dependencies",
          "timestamp",
        ],
      },
      // Matches the body shape from not-found.ts / error-handler.ts.
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Not Found" },
        },
        required: ["error"],
      },
    },
  },
};

// `__dirname`-relative globs resolve in both dev (ts-node, `.ts`) and prod
// (compiled `dist`, `.js`). swagger-jsdoc reads the `@openapi` blocks from
// these files — keep `removeComments` off in tsconfig so they survive the build.
const apis = [
  path.join(__dirname, "../routes/*.{ts,js}"),
  path.join(__dirname, "./*.{ts,js}"),
];

export const apiSpec = buildOpenApiSpec({ definition, apis });
