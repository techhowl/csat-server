import { Router, type Request, type Response } from "express";
import { database } from "@csat/shared";

export const healthRouter = Router();

/**
 * Liveness + readiness in one cheap endpoint.
 * `status: ok` only when the Mongo singleton reports a live connection.
 * Returns 503 when the DB is down so load balancers / Dokploy health checks
 * can pull the instance out of rotation.
 */
healthRouter.get("/health", (_req: Request, res: Response) => {
  const dbConnected = database.isConnected();
  const status = dbConnected ? "ok" : "degraded";

  res.status(dbConnected ? 200 : 503).json({
    status,
    service: "api",
    uptimeSec: Math.round(process.uptime()),
    dependencies: {
      mongo: dbConnected ? "up" : "down",
    },
    timestamp: new Date().toISOString(),
  });
});
