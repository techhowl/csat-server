import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// config.ts validates env at import time, so each case resets the module
// registry and re-imports with a fresh process.env to re-trigger evaluation.
const CONFIG_PATH = "../../../packages/shared/src/config";

async function loadConfig() {
  return (await import(CONFIG_PATH)).config;
}

describe("shared config", () => {
  const original = process.env;

  // Vars config.ts reads. Scrubbed before each case so ambient env (e.g.
  // Infisical-injected LOG_LEVEL/WORKER_POLL_INTERVAL_MS during
  // `npm run test:integration`) can't bleed into default-value assertions.
  const CONFIG_VARS = [
    "NODE_ENV",
    "LOG_LEVEL",
    "MONGO_URI",
    "MONGO_DB_NAME",
    "API_PORT",
    "WORKER_POLL_INTERVAL_MS",
    "SCHEDULER_TICK_INTERVAL_MS",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ACCESS_TTL",
    "JWT_REFRESH_TTL",
    "PASSWORD_PEPPER",
  ];

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...original };
    for (const key of CONFIG_VARS) delete process.env[key];
  });

  afterEach(() => {
    process.env = original;
  });

  // Minimum env for config to import without throwing on a required var.
  const REQUIRED_ENV = {
    MONGO_URI: "mongodb://localhost:27017",
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    PASSWORD_PEPPER: "test-pepper-for-unit-tests",
  };

  it("throws when required MONGO_URI is missing", async () => {
    delete process.env.MONGO_URI;
    await expect(loadConfig()).rejects.toThrow(
      /Missing required environment variable: MONGO_URI/
    );
  });

  it("throws when required JWT_ACCESS_SECRET is missing", async () => {
    process.env.MONGO_URI = REQUIRED_ENV.MONGO_URI;
    process.env.JWT_REFRESH_SECRET = REQUIRED_ENV.JWT_REFRESH_SECRET;
    process.env.PASSWORD_PEPPER = REQUIRED_ENV.PASSWORD_PEPPER;
    delete process.env.JWT_ACCESS_SECRET;
    await expect(loadConfig()).rejects.toThrow(
      /Missing required environment variable: JWT_ACCESS_SECRET/
    );
  });

  it("throws when required PASSWORD_PEPPER is missing", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.PASSWORD_PEPPER;
    await expect(loadConfig()).rejects.toThrow(
      /Missing required environment variable: PASSWORD_PEPPER/
    );
  });

  it("applies defaults for optional vars", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.NODE_ENV;
    delete process.env.MONGO_DB_NAME;
    delete process.env.API_PORT;

    const config = await loadConfig();
    expect(config.nodeEnv).toBe("development");
    expect(config.isProduction).toBe(false);
    expect(config.mongo.dbName).toBe("csat");
    expect(config.api.port).toBe(4000);
    expect(config.worker.pollIntervalMs).toBe(5000);
    expect(config.scheduler.tickIntervalMs).toBe(10000);
    expect(config.jwt.accessTtl).toBe("15m");
    expect(config.jwt.refreshTtl).toBe("30d");
  });

  it("reads provided values", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    process.env.NODE_ENV = "production";
    process.env.MONGO_DB_NAME = "csat_prod";
    process.env.API_PORT = "8080";
    process.env.JWT_ACCESS_TTL = "5m";
    process.env.JWT_REFRESH_TTL = "7d";

    const config = await loadConfig();
    expect(config.nodeEnv).toBe("production");
    expect(config.isProduction).toBe(true);
    expect(config.logLevel).toBe("info");
    expect(config.mongo.dbName).toBe("csat_prod");
    expect(config.api.port).toBe(8080);
    expect(config.jwt.accessSecret).toBe(REQUIRED_ENV.JWT_ACCESS_SECRET);
    expect(config.jwt.refreshSecret).toBe(REQUIRED_ENV.JWT_REFRESH_SECRET);
    expect(config.jwt.accessTtl).toBe("5m");
    expect(config.jwt.refreshTtl).toBe("7d");
  });

  it("throws when an integer var is not numeric", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    process.env.API_PORT = "not-a-number";
    await expect(loadConfig()).rejects.toThrow(/API_PORT must be an integer/);
  });
});
