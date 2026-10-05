import path from "node:path";
import { buildOpenApiSpec } from "@csat/http";
import { components } from "./components";

/**
 * The `api` service's OWN OpenAPI document.
 *
 * Base definition (info, servers, tags) lives here as a typed object; reusable
 * schemas/responses/security schemes live in `./components.ts`; per-endpoint
 * operations are picked up from colocated `@openapi` JSDoc blocks on the route
 * files (see `apis` glob below). The docs routes themselves are mounted by
 * `mountDocs` in `@csat/http`, so their operations are annotated at the bottom
 * of this file instead.
 *
 * `servers` is relative (`/`) on purpose — no `config` import — so the spec
 * stays decoupled from environment and the unit-test mock of `@csat/shared`
 * (which omits `config`) keeps working.
 */

// Rendered as Markdown at the top of Swagger UI.
const description = `
HTTP API for the CSAT platform.

## Routes available today

| Method | Path | Auth | Purpose |
|---|---|---|---|
| \`GET\` | \`/health\` | Public | Liveness + readiness probe |
| \`POST\` | \`/auth/signup\` | Public | Create a local account and sign in |
| \`POST\` | \`/auth/login\` | Public | Exchange email + password for tokens |
| \`POST\` | \`/auth/refresh\` | Public (refresh token in body) | Rotate the token pair |
| \`POST\` | \`/auth/logout\` | Public (refresh token in body) | End the current session |
| \`POST\` | \`/auth/logout-all\` | **Bearer** | End every session of the user |
| \`GET\` | \`/auth/me\` | **Bearer** | Get the authenticated user |
| \`GET\` | \`/openapi.json\` | Public | This OpenAPI document |
| \`GET\` | \`/docs\` | Public | Swagger UI (redirects to \`/docs/\`) |

Any other method/path returns **404** \`{ "error": "Not Found" }\`.

## Authentication

**Try it here:** call \`POST /auth/signup\` or \`POST /auth/login\`, copy
\`tokens.accessToken\` from the response, click **Authorize** above and paste it
(without the \`Bearer \` prefix). Routes marked with a padlock now send it.

1. **Sign up / log in** → \`{ user, tokens }\`.
2. **Call protected routes** with \`Authorization: Bearer <accessToken>\`.
   The access token is a JWT, default lifetime \`15m\` (\`tokens.expiresIn\` seconds).
3. **When it expires** (401), call \`POST /auth/refresh\` with the refresh token →
   a **new** pair. Refresh tokens are **single-use**: always store the new one.
   Reusing an old refresh token is treated as theft and **revokes every session**.
4. **Log out** with \`POST /auth/logout\` (this device) or \`POST /auth/logout-all\`
   (all devices). Access tokens are stateless and stay valid until they expire.

Other details:

- **Refresh token** — JWT, default lifetime \`30d\`, signed with a separate secret.
  Stored server-side only as a SHA-256 hash, so it can be revoked.
- **Passwords** — \`bcrypt(HMAC-SHA256(password, pepper))\`, cost 12.
- **Authorization** — \`role\` (\`admin\` | \`user\`) is checked per route; a valid
  token with the wrong role returns **403**. New accounts always get \`user\`.

## Errors

Every error has the body \`{ "error": string }\` (see \`ErrorResponse\`).

| Status | Meaning |
|---|---|
| 400 | Request validation failed (unknown body keys are rejected) |
| 401 | Bad credentials; missing / invalid / expired / revoked token; or user deleted / deactivated |
| 403 | Authenticated but role not allowed |
| 404 | No such route |
| 409 | Signup with an email that is already registered |
| 500 | Unexpected server fault (generic message) |
| 503 | \`/health\` only — a hard dependency is down |

## Limits

- JSON and URL-encoded request bodies are capped at **100 kb**.
`.trim();

const definition = {
  openapi: "3.0.3",
  info: {
    title: "CSAT API",
    version: "0.1.0",
    description,
  },
  servers: [{ url: "/", description: "current host" }],
  tags: [
    {
      name: "Health",
      description: "Liveness and readiness probes for load balancers.",
    },
    {
      name: "Auth",
      description:
        "Sign up, log in, rotate tokens, log out, and read the current user.",
    },
    {
      name: "Docs",
      description: "This API documentation (Swagger UI and the raw spec).",
    },
  ],
  components,
};

// `__dirname`-relative globs resolve in both dev (ts-node, `.ts`) and prod
// (compiled `dist`, `.js`). swagger-jsdoc reads the `@openapi` blocks from
// these files — keep `removeComments` off in tsconfig so they survive the build.
const apis = [
  path.join(__dirname, "../routes/*.{ts,js}"),
  path.join(__dirname, "./*.{ts,js}"),
];

/**
 * @openapi
 * /openapi.json:
 *   get:
 *     operationId: getOpenApiSpec
 *     summary: Raw OpenAPI document
 *     description: >
 *       Returns this OpenAPI 3.0.3 document as JSON. It is built once at
 *       startup from `services/api/src/docs/` plus the `@openapi` annotations
 *       on `services/api/src/routes/*`. Use it for client code generation or
 *       for importing into Postman/Insomnia.
 *     tags: [Docs]
 *     responses:
 *       200:
 *         description: The OpenAPI document.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [openapi, info, paths]
 *               properties:
 *                 openapi:
 *                   type: string
 *                   example: 3.0.3
 *                 info:
 *                   type: object
 *                 paths:
 *                   type: object
 *                 components:
 *                   type: object
 * /docs:
 *   get:
 *     operationId: getSwaggerUi
 *     summary: Swagger UI
 *     description: >
 *       Interactive documentation for this API (the page you are reading).
 *       `GET /docs` answers **301** with `Location: /docs/`; the UI itself is
 *       served from `/docs/`. A relaxed Content-Security-Policy is applied to
 *       this path only so Swagger UI's inline scripts can run; the rest of the
 *       API keeps helmet's strict default.
 *     tags: [Docs]
 *     responses:
 *       200:
 *         description: Swagger UI HTML page (served at `/docs/`).
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       301:
 *         description: Redirect from `/docs` to `/docs/`.
 *         headers:
 *           Location:
 *             description: Always `/docs/`.
 *             schema:
 *               type: string
 *               example: /docs/
 */
export const apiSpec = buildOpenApiSpec({ definition, apis });
