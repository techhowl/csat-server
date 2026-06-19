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
  ];

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...original };
    for (const key of CONFIG_VARS) delete process.env[key];
  });

  afterEach(() => {
    process.env = original;
  });

  it("throws when required MONGO_URI is missing", async () => {
    delete process.env.MONGO_URI;
    await expect(loadConfig()).rejects.toThrow(
      /Missing required environment variable: MONGO_URI/
    );
  });

  it("applies defaults for optional vars", async () => {
    process.env.MONGO_URI = "mongodb://localhost:27017";
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
  });

  it("reads provided values", async () => {
    process.env.MONGO_URI = "mongodb://db:27017";
    process.env.NODE_ENV = "production";
    process.env.MONGO_DB_NAME = "csat_prod";
    process.env.API_PORT = "8080";

    const config = await loadConfig();
    expect(config.nodeEnv).toBe("production");
    expect(config.isProduction).toBe(true);
    expect(config.logLevel).toBe("info");
    expect(config.mongo.dbName).toBe("csat_prod");
    expect(config.api.port).toBe(8080);
  });

  it("throws when an integer var is not numeric", async () => {
    process.env.MONGO_URI = "mongodb://localhost:27017";
    process.env.API_PORT = "not-a-number";
    await expect(loadConfig()).rejects.toThrow(/API_PORT must be an integer/);
  });
});
