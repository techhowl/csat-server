import { database } from "@csat/shared";

/**
 * Service layer — business logic, no HTTP knowledge.
 *
 * Gathers liveness/readiness state from the process and its hard dependencies
 * and returns a plain report. The controller decides how to map it onto an
 * HTTP response; this layer stays transport-agnostic so it can be reused (e.g.
 * by the worker/scheduler or a CLI) without dragging Express along.
 */

export type DependencyStatus = "up" | "down";

export interface HealthReport {
  status: "ok" | "degraded";
  service: string;
  uptimeSec: number;
  dependencies: {
    mongo: DependencyStatus;
  };
  timestamp: string;
}

// Build a point-in-time health snapshot. `status` is "ok" only when every hard
// dependency is reachable; otherwise "degraded".
export function getHealthReport(): HealthReport {
  const mongoUp = database.isConnected();

  return {
    status: mongoUp ? "ok" : "degraded",
    service: "api",
    uptimeSec: Math.round(process.uptime()),
    dependencies: {
      mongo: mongoUp ? "up" : "down",
    },
    timestamp: new Date().toISOString(),
  };
}
