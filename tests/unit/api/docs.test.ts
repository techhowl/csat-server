import { describe, expect, it, vi } from "vitest";
import request from "supertest";

// Same stub as health.test.ts: importing the API app must not evaluate the real
// @csat/shared config (needs MONGO_URI) or open a Mongo connection. The OpenAPI
// spec deliberately avoids `config`, so a logger + database stub is enough.
vi.mock("@csat/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  database: {
    isConnected: () => true,
  },
}));

import { createApp } from "../../../services/api/src/app";

describe("API docs", () => {
  it("serves the OpenAPI spec at /openapi.json with the /health path", async () => {
    const res = await request(createApp()).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeTruthy();
    expect(res.body.info.title).toBe("CSAT API");
    // Path operation comes from the @openapi annotation on the health route.
    expect(res.body.paths["/health"]).toBeDefined();
    expect(res.body.paths["/health"].get).toBeDefined();
    // Reusable component schemas come from the base definition.
    expect(res.body.components.schemas.HealthReport).toBeDefined();
    expect(res.body.components.schemas.ErrorResponse).toBeDefined();
  });

  it("serves Swagger UI at /docs/", async () => {
    const res = await request(createApp()).get("/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
