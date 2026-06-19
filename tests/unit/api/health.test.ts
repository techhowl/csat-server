import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Mock the whole shared package so importing the API app never evaluates the
// real config (which requires MONGO_URI) or opens a Mongo connection. We only
// need a logger stub and a controllable database.isConnected().
let connected = true;

vi.mock("@csat/shared", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  database: {
    isConnected: () => connected,
  },
}));

import { createApp } from "../../../services/api/src/app";

describe("GET /health", () => {
  beforeEach(() => {
    connected = true;
  });

  it("returns 200 and mongo up when DB is connected", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("api");
    expect(res.body.dependencies.mongo).toBe("up");
  });

  it("returns 503 and degraded when DB is down", async () => {
    connected = false;
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.dependencies.mongo).toBe("down");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(createApp()).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not Found");
  });
});
