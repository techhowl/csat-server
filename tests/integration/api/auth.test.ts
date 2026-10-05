import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import request from "supertest";
import type { Application } from "express";
import { describeIntegration } from "../../setup";

// Same pattern as app.test.ts: dynamic imports inside the suite so the real
// @csat/shared config (needs MONGO_URI + secrets) is never evaluated when
// integration tests are skipped.
describeIntegration("Auth routes against real Mongo", () => {
  let app: Application;
  let spec: {
    components: {
      schemas: Record<
        string,
        { required?: string[]; properties: Record<string, unknown> }
      >;
    };
  };

  beforeAll(async () => {
    const { config, database } = await import("@csat/shared");
    if (!/test/i.test(config.mongo.dbName)) {
      throw new Error(
        `Refusing to run integration tests against DB "${config.mongo.dbName}". ` +
          `Set MONGO_DB_NAME to a *_test database.`
      );
    }
    await database.connect();
    // Unique indexes (email, tokenHash) must exist before duplicate tests run.
    const { User, RefreshToken } =
      await import("../../../services/api/src/models");
    await Promise.all([User.init(), RefreshToken.init()]);

    const { createApp } = await import("../../../services/api/src/app");
    app = createApp();
    spec = (await request(app).get("/openapi.json")).body;
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

  // Asserts a response body conforms to a component schema's keys: every
  // required key present and no undocumented keys.
  function expectMatchesSchema(body: Record<string, unknown>, name: string) {
    const schema = spec.components.schemas[name];
    for (const key of schema.required ?? []) {
      expect(body, `${name}.${key}`).toHaveProperty(key);
    }
    for (const key of Object.keys(body)) {
      expect(
        Object.keys(schema.properties),
        `${name} documents ${key}`
      ).toContain(key);
    }
  }

  const priya = {
    name: "Priya Sharma",
    email: "Priya+CSAT@Example.com ",
    password: "Sup3rSecret",
  };

  async function signup(body: object = priya) {
    return request(app).post("/auth/signup").send(body);
  }

  async function login(
    email = "priya+csat@example.com",
    password = "Sup3rSecret"
  ) {
    return request(app).post("/auth/login").send({ email, password });
  }

  it("signs up, returning a normalised user and a token pair that match the spec", async () => {
    const res = await signup();

    expect(res.status).toBe(201);
    expectMatchesSchema(res.body, "AuthResponse");
    expectMatchesSchema(res.body.user, "User");
    expectMatchesSchema(res.body.tokens, "AuthTokens");

    expect(res.body.user).toMatchObject({
      name: "Priya Sharma",
      email: "priya+csat@example.com", // trimmed + lowercased; "+" accepted
      provider: "local",
      role: "user",
      isActive: true,
      accessScopes: [],
    });
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("__v");
    expect(res.body.tokens.tokenType).toBe("Bearer");
    expect(res.body.tokens.expiresIn).toBeGreaterThan(0);
  });

  it("stores the password as a bcrypt hash and refresh tokens only as SHA-256 hashes", async () => {
    const res = await signup();
    const { User, RefreshToken } =
      await import("../../../services/api/src/models");
    const { hashToken } = await import("../../../services/api/src/utils/jwt");

    const user = await User.findById(res.body.user._id).select("+password");
    expect(user?.password).toMatch(/^\$2[aby]\$12\$/);

    const rows = await RefreshToken.find({ userId: res.body.user._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(res.body.tokens.refreshToken));
    expect(JSON.stringify(rows)).not.toContain(res.body.tokens.refreshToken);
  });

  it("rejects a duplicate email with 409", async () => {
    await signup();
    const res = await signup({ ...priya, email: "PRIYA+csat@example.com" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Email is already registered" });
  });

  it("rejects privilege fields smuggled into signup with 400", async () => {
    const res = await signup({ ...priya, role: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unrecognized key/);
  });

  it("logs in and updates lastLoginAt", async () => {
    const created = await signup();
    const res = await login();

    expect(res.status).toBe(200);
    expectMatchesSchema(res.body, "AuthResponse");
    expect(res.body.user._id).toBe(created.body.user._id);
    expect(
      new Date(res.body.user.lastLoginAt).getTime()
    ).toBeGreaterThanOrEqual(new Date(created.body.user.lastLoginAt).getTime());
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    await signup();
    const wrong = await login("priya+csat@example.com", "Wr0ngPassword");
    const unknown = await login("nobody@example.com", "Sup3rSecret");

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual({ error: "Invalid email or password" });
    expect(unknown.body).toEqual(wrong.body);
  });

  it("serves /auth/me for a valid access token and 401 without one", async () => {
    const { body } = await signup();

    const me = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${body.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expectMatchesSchema(me.body, "MeResponse");
    expect(me.body.user).toEqual(body.user);

    const anon = await request(app).get("/auth/me");
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual({ error: "Authorization header missing" });
  });

  it("rotates refresh tokens and revokes everything when an old one is reused", async () => {
    const { body } = await signup();
    const first = body.tokens.refreshToken;

    const rotated = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    expectMatchesSchema(rotated.body, "RefreshResponse");
    expectMatchesSchema(rotated.body.tokens, "AuthTokens");
    const second = rotated.body.tokens.refreshToken;
    expect(second).not.toBe(first);

    // Reusing the consumed token → theft assumed → all sessions revoked.
    const reuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: first });
    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({ error: "Refresh token has been revoked" });

    // …which also kills the legitimately rotated token.
    const afterReuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: second });
    expect(afterReuse.status).toBe(401);
  });

  it("rejects a tampered refresh token", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "not.a.jwt" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/^Invalid refresh token/);
  });

  it("logs out one session and is idempotent", async () => {
    const { body } = await signup();
    const { refreshToken } = body.tokens;

    const out = await request(app).post("/auth/logout").send({ refreshToken });
    expect(out.status).toBe(204);

    const again = await request(app)
      .post("/auth/logout")
      .send({ refreshToken });
    expect(again.status).toBe(204);

    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it("logs out of every session with /auth/logout-all", async () => {
    const a = (await signup()).body.tokens;
    const b = (await login()).body.tokens;
    const { RefreshToken } = await import("../../../services/api/src/models");
    expect(await RefreshToken.countDocuments()).toBe(2);

    const res = await request(app)
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(res.status).toBe(204);
    expect(await RefreshToken.countDocuments()).toBe(0);

    for (const t of [a, b]) {
      const r = await request(app)
        .post("/auth/refresh")
        .send({ refreshToken: t.refreshToken });
      expect(r.status).toBe(401);
    }
  });

  it("does not let a stale device end new sessions after logout-all", async () => {
    const stale = (await signup()).body.tokens;
    await request(app)
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${stale.accessToken}`);
    const fresh = (await login()).body.tokens;

    // The old device's token is rejected as revoked…
    const old = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: stale.refreshToken });
    expect(old.status).toBe(401);
    expect(old.body).toEqual({ error: "Refresh token has been revoked" });

    // …but that is NOT treated as theft: the new session survives.
    const res = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: fresh.refreshToken });
    expect(res.status).toBe(200);
  });

  it("blocks a deactivated user on login, /auth/me and refresh", async () => {
    const { body } = await signup();
    const { User } = await import("../../../services/api/src/models");
    await User.updateOne({ _id: body.user._id }, { isActive: false });

    const loginRes = await login();
    expect(loginRes.status).toBe(401);
    expect(loginRes.body).toEqual({ error: "Account is deactivated" });

    const me = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${body.tokens.accessToken}`);
    expect(me.status).toBe(401);

    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: body.tokens.refreshToken });
    expect(refreshed.status).toBe(401);
    expect(refreshed.body).toEqual({ error: "Account is deactivated" });
  });
});
