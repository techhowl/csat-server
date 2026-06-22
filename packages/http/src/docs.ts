import type { Application, Request, Response } from "express";
import helmet from "helmet";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

/**
 * Shared HTTP docs toolkit — reused by every HTTP service in the monorepo.
 *
 * Each service supplies its own OpenAPI `definition` and source globs; this
 * package owns the build (swagger-jsdoc), the Swagger UI mount, and the
 * route-scoped Content-Security-Policy needed for the UI to load. Keeping it
 * here means a new HTTP service gets docs by following the same two calls
 * (`buildOpenApiSpec` + `mountDocs`) with no copy-paste.
 */

export interface OpenApiSpecOptions {
  /** Base OpenAPI document: info, servers, components, security, etc. */
  definition: swaggerJSDoc.Options["definition"];
  /**
   * Globs of source files carrying `@openapi` JSDoc blocks. Pass `__dirname`-
   * relative `*.{ts,js}` patterns so the same spec resolves in dev (ts-node,
   * `.ts`) and prod (compiled `dist`, `.js`).
   */
  apis: string[];
}

export interface MountDocsOptions {
  /** Swagger UI mount path. Default `/docs`. */
  path?: string;
  /** Raw JSON spec path. Default `/openapi.json`. */
  jsonPath?: string;
}

/** Build an OpenAPI document from a base definition + annotated source globs. */
export function buildOpenApiSpec(options: OpenApiSpecOptions): object {
  return swaggerJSDoc({
    definition: options.definition,
    apis: options.apis,
  });
}

/**
 * Mount Swagger UI + the raw JSON spec on an Express app.
 *
 * Swagger UI ships inline scripts/styles, which the app's global strict
 * `helmet()` CSP blocks. We apply a relaxed CSP scoped to the docs path only —
 * the rest of the app keeps its strict default.
 */
export function mountDocs(
  app: Application,
  spec: object,
  options: MountDocsOptions = {}
): void {
  const path = options.path ?? "/docs";
  const jsonPath = options.jsonPath ?? "/openapi.json";

  app.get(jsonPath, (_req: Request, res: Response) => {
    res.json(spec);
  });

  const docsCsp = helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  });

  app.use(path, docsCsp, swaggerUi.serve, swaggerUi.setup(spec));
}
