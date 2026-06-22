import type { NextFunction, Request, Response } from "express";
import { createLogger } from "@csat/shared";

const log = createLogger("api");

/**
 * Centralised error handler — must be the last `app.use`. Logs full detail
 * server-side, returns an opaque message to the client so we never leak stack
 * traces or internal state. The unused `_next` keeps Express's 4-arg signature
 * so it is recognised as an error handler.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  log.error("Unhandled request error", {
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: "Internal Server Error" });
}
