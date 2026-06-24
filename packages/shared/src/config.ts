/**
 * Centralised, validated environment config.
 *
 * Fails fast at boot if a required variable is missing rather than blowing up
 * deep inside a request later. Never log the raw config object — it may carry
 * credentials (e.g. MONGO_URI with user:pass).
 */

type NodeEnv = "development" | "test" | "production";

// Helper functions to read and validate environment variables.

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Environment variable ${name} must be an integer, got: ${raw}`
    );
  }
  return parsed;
}

const nodeEnv = optional("NODE_ENV", "development") as NodeEnv;

export const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  logLevel: optional("LOG_LEVEL", nodeEnv === "production" ? "info" : "debug"),

  mongo: {
    uri: required("MONGO_URI"),
    dbName: optional("MONGO_DB_NAME", "csat"),
  },

  api: {
    port: int("API_PORT", 4000),
  },

  worker: {
    pollIntervalMs: int("WORKER_POLL_INTERVAL_MS", 5000),
  },

  scheduler: {
    tickIntervalMs: int("SCHEDULER_TICK_INTERVAL_MS", 10000),
  },

  jwt: {
    // Signing secrets are required — no defaults, so a missing secret fails
    // fast at boot instead of silently signing tokens with a weak key.
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    // TTLs accept any `jsonwebtoken` expiresIn string (e.g. "15m", "30d").
    accessTtl: optional("JWT_ACCESS_TTL", "15m"),
    refreshTtl: optional("JWT_REFRESH_TTL", "30d"),
  },

  security: {
    // Password pepper adds an additional layer of security to password hashing
    // This should be a long, random string that's kept secret
    passwordPepper: required("PASSWORD_PEPPER"),
  },
} as const;

export type AppConfig = typeof config;
