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

import { z } from "zod";
import { createApp } from "../../../services/api/src/app";
import {
  loginSchema,
  refreshSchema,
  signupSchema,
} from "../../../services/api/src/dto/auth.dto";

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

  it("declares the bearerAuth JWT security scheme without making it global", async () => {
    const res = await request(createApp()).get("/openapi.json");
    expect(res.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    // /health must stay public — no spec-wide security requirement.
    expect(res.body.security).toBeUndefined();
    expect(res.body.paths["/health"].get.security).toBeUndefined();
  });

  it("serves Swagger UI at /docs/", async () => {
    const res = await request(createApp()).get("/docs/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });

  it("documents exactly the routes the app serves, with matching statuses", async () => {
    const app = createApp();
    const spec = (await request(app).get("/openapi.json")).body;

    // A new route without an @openapi block (or a doc for a route that doesn't
    // exist) fails here — update this list together with the spec.
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/docs",
      "/health",
      "/openapi.json",
    ]);

    // Each live response status must be one the spec declares for that path.
    for (const path of Object.keys(spec.paths)) {
      const res = await request(app).get(path);
      expect(Object.keys(spec.paths[path].get.responses)).toContain(
        String(res.status)
      );
    }
  });

  it("resolves every $ref in the spec", async () => {
    const spec = (await request(createApp()).get("/openapi.json")).body;
    const refs = JSON.stringify(spec).match(/"\$ref":"[^"]+"/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const raw of refs) {
      const pointer = raw.slice('"$ref":"#/'.length, -1).split("/");
      const target = pointer.reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        spec
      );
      expect(target, raw).toBeDefined();
    }
  });

  it.each([
    ["SignupRequest", signupSchema],
    ["LoginRequest", loginSchema],
    ["RefreshRequest", refreshSchema],
  ] as const)(
    "keeps the %s schema in sync with its Zod DTO",
    async (name, dto) => {
      const spec = (await request(createApp()).get("/openapi.json")).body;
      // The hand-written schema may add formats/descriptions/examples, but every
      // constraint Zod emits (keys, required, lengths, patterns, strictness)
      // must be present and identical.
      const fromZod = z.toJSONSchema(dto, {
        target: "openapi-3.0",
        io: "input",
      });
      expect(spec.components.schemas[name]).toMatchObject(fromZod);
    }
  );
});
