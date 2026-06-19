import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { createLogger } from "@csat/shared";
import { healthRouter } from "./routes/health";

// Create a logger instance for the API service.
const log = createLogger("api");

// create app  creates the express app  with security headers, body parsing, routes, and error handling.
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

  // Routes
  app.use("/", healthRouter);

  // 404 — keep it generic, no stack or internals leaked.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Centralised error handler. Logs full detail server-side, returns an opaque
  // message to the client so we never leak stack traces or internal state.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error("Unhandled request error", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}
