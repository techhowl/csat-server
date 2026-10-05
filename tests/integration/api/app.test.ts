import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import request from "supertest";
import type { Application } from "express";
import { describeIntegration } from "../../setup";

// Imports are dynamic and inside the suite so this file does NOT evaluate the
// real @csat/shared config (which requires MONGO_URI) when integration tests
// are skipped locally.
describeIntegration("API health against real Mongo", () => {
  let app: Application;

  beforeAll(async () => {
    const { config, database } = await import("@csat/shared");
    // Hard guard: afterEach wipes collections, so refuse to run against any DB
    // that isn't an explicit test database. Prevents nuking dev/prod data when
    // MONGO_URI comes from .env (or CI env).
    if (!/test/i.test(config.mongo.dbName)) {
      throw new Error(
        `Refusing to run integration tests against DB "${config.mongo.dbName}". ` +
          `Set MONGO_DB_NAME to a *_test database.`
      );
    }
    await database.connect();
    // Import (and build) the app here, under the 30s hookTimeout: the first
    // import of the whole API is slow under coverage instrumentation and
    // doesn't fit the 5s per-test timeout.
    const { createApp } = await import("../../../services/api/src/app");
    app = createApp();
  });

  afterEach(async () => {
    const { mongoose } = await import("@csat/shared");
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    const { database } = await import("@csat/shared");
    await database.disconnect();
  });

  it("reports mongo up with a live connection", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.dependencies.mongo).toBe("up");
  });
});
