import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import request from "supertest";
import { describeIntegration } from "../../setup";

// Imports are dynamic and inside the suite so this file does NOT evaluate the
// real @csat/shared config (which requires MONGO_URI) when integration tests
// are skipped locally.
describeIntegration("API health against real Mongo", () => {
  beforeAll(async () => {
    const { config, database } = await import("@csat/shared");
    // Hard guard: afterEach wipes collections, so refuse to run against any DB
    // that isn't an explicit test database. Prevents nuking dev/prod data when
    // MONGO_URI comes from Infisical.
    if (!/test/i.test(config.mongo.dbName)) {
      throw new Error(
        `Refusing to run integration tests against DB "${config.mongo.dbName}". ` +
          `Set MONGO_DB_NAME to a *_test database.`
      );
    }
    await database.connect();
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
    const { createApp } = await import("../../../services/api/src/app");
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.dependencies.mongo).toBe("up");
  });
});
