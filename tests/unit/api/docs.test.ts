import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Application } from "express";

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
  // Read at import time by the auth routes (jwt/password utils).
  config: {
    jwt: {
      accessSecret: "test-access-secret",
      refreshSecret: "test-refresh-secret",
      accessTtl: "15m",
      refreshTtl: "30d",
    },
    security: { passwordPepper: "test-pepper" },
    google: { clientId: "", allowedDomains: ["howl.in"] },
    cors: { origins: [] },
  },
}));

import { z } from "zod";
import { createApp } from "../../../services/api/src/app";
import {
  loginSchema,
  refreshSchema,
  googleAuthSchema,
  signupSchema,
} from "../../../services/api/src/dto/auth.dto";

// Minimal view of Express 4's internal router stack — enough to enumerate
// `METHOD path` for every route, recursing into mounted routers. All routers
// are mounted at "/" with full paths, so no mount-prefix handling is needed.
interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: Layer[] };
}
function listRoutes(app: Application): string[] {
  const walk = (stack: Layer[]): string[] =>
    stack.flatMap((layer) => {
      if (layer.route) {
        return Object.keys(layer.route.methods).map(
          (m) => `${m} ${layer.route!.path}`
        );
      }
      if (layer.name === "router" && layer.handle?.stack) {
        return walk(layer.handle.stack);
      }
      return [];
    });
  return walk(
    (app as unknown as { _router: { stack: Layer[] } })._router.stack
  );
}

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

  it("documents exactly the routes Express has registered", async () => {
    const app = createApp();
    const spec = (await request(app).get("/openapi.json")).body;

    const documented = Object.entries(spec.paths as Record<string, object>)
      .flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m} ${path}`))
      .sort();

    // Swagger UI is mounted with app.use (not a route layer), so add it by hand.
    const registered = [...listRoutes(app), "get /docs"].sort();

    // A route without an @openapi block, or a doc for a route that doesn't
    // exist, fails here.
    expect(documented).toEqual(registered);
    expect(documented).toEqual([
      "get /auth/me",
      "get /docs",
      "get /health",
      "get /openapi.json",
      "post /auth/google",
      "post /auth/login",
      "post /auth/logout",
      "post /auth/logout-all",
      "post /auth/refresh",
      "post /auth/signup",
    ]);
  });

  it("returns only documented statuses from the routes that need no database", async () => {
    const app = createApp();
    const spec = (await request(app).get("/openapi.json")).body;
    for (const path of ["/health", "/openapi.json", "/docs"]) {
      const res = await request(app).get(path);
      expect(Object.keys(spec.paths[path].get.responses)).toContain(
        String(res.status)
      );
    }
  });

  it("marks exactly the authenticate-protected operations with bearerAuth", async () => {
    const spec = (await request(createApp()).get("/openapi.json")).body;
    const secured = Object.entries(
      spec.paths as Record<string, Record<string, { security?: unknown }>>
    )
      .flatMap(([path, ops]) =>
        Object.entries(ops)
          .filter(([, op]) => op.security)
          .map(([m]) => `${m} ${path}`)
      )
      .sort();
    expect(secured).toEqual(["get /auth/me", "post /auth/logout-all"]);
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
    ["GoogleAuthRequest", googleAuthSchema],
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
