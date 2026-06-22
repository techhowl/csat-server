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
 *     summary: Liveness + readiness probe
 *     description: >
 *       Returns `ok` (200) only when every hard dependency is reachable;
 *       otherwise `degraded` (503) so load balancers / Dokploy health checks
 *       can pull the instance out of rotation.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service healthy — all dependencies up.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthReport'
 *       503:
 *         description: Service degraded — a hard dependency is down.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthReport'
 */
healthRouter.get("/health", getHealth);
