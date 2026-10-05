import { Router } from "express";
import { getHealth } from "../controllers/health";

/**
 * Route layer — maps HTTP paths to controller handlers. No logic beyond wiring.
 */
export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     operationId: getHealth
 *     summary: Liveness + readiness probe
 *     description: >
 *       Returns `ok` (200) only when every hard dependency is reachable;
 *       otherwise `degraded` (503) so load balancers / Dokploy health checks
 *       can pull the instance out of rotation.
 *
 *
 *       Public — no token required. Cheap: reads in-memory connection state
 *       only and performs no database query, so it is safe to poll frequently.
 *       Hard dependencies checked today: MongoDB.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service healthy — all dependencies up.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthReport'
 *             example:
 *               status: ok
 *               service: api
 *               uptimeSec: 3600
 *               dependencies:
 *                 mongo: up
 *               timestamp: "2026-10-05T07:12:45.123Z"
 *       503:
 *         description: Service degraded — a hard dependency is down.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthReport'
 *             example:
 *               status: degraded
 *               service: api
 *               uptimeSec: 3600
 *               dependencies:
 *                 mongo: down
 *               timestamp: "2026-10-05T07:12:45.123Z"
 */
healthRouter.get("/health", getHealth);
