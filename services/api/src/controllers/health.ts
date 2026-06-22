import type { Request, Response } from "express";
import { getHealthReport } from "../services/health";

/**
 * Controller layer — the HTTP boundary.
 *
 * Reads the request, calls the service, and maps the result onto a response
 * (status code + body). No business logic lives here.
 */

// GET /health — liveness + readiness in one cheap endpoint. Returns 503 when a
// hard dependency is down so load balancers / Dokploy health checks can pull
// the instance out of rotation.
export function getHealth(_req: Request, res: Response): void {
  const report = getHealthReport();
  const httpStatus = report.status === "ok" ? 200 : 503;
  res.status(httpStatus).json(report);
}
