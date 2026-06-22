import express, { type Application } from "express";
import helmet from "helmet";
import { mountDocs } from "@csat/http";
import { router } from "./routes";
import { apiSpec } from "./docs/openapi";
import { notFound } from "./middlewares/not-found";
import { errorHandler } from "./middlewares/error-handler";

/**
 * Composition root — assembles middleware → routes → error handling.
 *
 * Request flow follows the layering:
 *   routes/ (HTTP paths) → controllers/ (request/response) →
 *   services/ (business logic) → models/ (persistence)
 */
export function createApp(): Application {
  const app = express();

  // Trust the reverse proxy (Traefik/Cloudflare in this stack) so req.ip and
  // secure-cookie logic see the real client address.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Baseline security headers.
  app.use(helmet());

  // Bounded body parsing — cap payload size to blunt trivial DoS via huge bodies.
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  // Feature routes (mounted through the root router aggregator).
  app.use("/", router);

  // API docs — Swagger UI at /docs, raw spec at /openapi.json. Always on.
  // Must mount before notFound, else /docs falls through to the 404 handler.
  mountDocs(app, apiSpec);

  // 404 + centralised error handler — must come last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
