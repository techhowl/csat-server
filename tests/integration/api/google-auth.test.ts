import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Application } from "express";
import { describeIntegration } from "../../setup";

// Only the Google token check is mocked (no network, no real Google account);
// everything else — routes, service, Mongo — is real. Each test sets what the
// "verified" Google identity is, or which error verification throws.
const { verifyGoogleIdToken } = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
}));
vi.mock("../../../services/api/src/utils/google", () => ({
  verifyGoogleIdToken,
}));

describeIntegration("POST /auth/google against real Mongo", () => {
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
    const { User, RefreshToken } =
      await import("../../../services/api/src/models");
    await Promise.all([User.init(), RefreshToken.init()]);

    const { createApp } = await import("../../../services/api/src/app");
    app = createApp();
    spec = (await request(app).get("/openapi.json")).body;
  });

  beforeEach(() => {
    verifyGoogleIdToken.mockReset();
    verifyGoogleIdToken.mockResolvedValue(priyaGoogle);
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

  const priyaGoogle = {
    sub: "google-sub-priya",
    email: "priya@howl.in",
    name: "Priya Sharma",
    picture: "https://lh3.googleusercontent.com/a/priya",
  };

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

  const google = () =>
    request(app).post("/auth/google").send({ idToken: "google-id-token" });

  it("creates a Google account on first sign-in (201) and the tokens work", async () => {
    const res = await google();

    expect(res.status).toBe(201);
    expectMatchesSchema(res.body, "AuthResponse");
    expectMatchesSchema(res.body.user, "User");
    expect(res.body.user).toMatchObject({
      email: "priya@howl.in",
      name: "Priya Sharma",
      provider: "google",
      role: "user",
      profileImage: "https://lh3.googleusercontent.com/a/priya",
      hasPassword: false,
      googleLinked: true,
    });
    expect(res.body.user).not.toHaveProperty("googleId");
    expect(verifyGoogleIdToken).toHaveBeenCalledWith("google-id-token");

    const me = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${res.body.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user._id).toBe(res.body.user._id);
    expect(me.body.user.googleLinked).toBe(true);
  });

  it("signs the same Google account in again (200, same user)", async () => {
    const first = await google();
    const second = await google();

    expect(second.status).toBe(200);
    expect(second.body.user._id).toBe(first.body.user._id);
    const { User } = await import("../../../services/api/src/models");
    expect(await User.countDocuments()).toBe(1);
  });

  it("links Google to an existing password account: same user, password cleared, sessions revoked", async () => {
    const signup = await request(app).post("/auth/signup").send({
      name: "Priya (local)",
      email: "Priya@howl.in",
      password: "Sup3rSecret",
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.hasPassword).toBe(true);

    const res = await google();

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      _id: signup.body.user._id, // one person = one account
      provider: "local", // how it was created — unchanged
      name: "Priya (local)", // existing profile kept
      hasPassword: false,
      googleLinked: true,
    });

    // Sessions from the password era are revoked…
    const oldRefresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: signup.body.tokens.refreshToken });
    expect(oldRefresh.status).toBe(401);
    // …and the unproven password no longer works.
    const pwLogin = await request(app)
      .post("/auth/login")
      .send({ email: "priya@howl.in", password: "Sup3rSecret" });
    expect(pwLogin.status).toBe(401);
    expect(pwLogin.body).toEqual({ error: "Invalid email or password" });

    // The new Google session does work.
    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: res.body.tokens.refreshToken });
    expect(refreshed.status).toBe(200);
  });

  it("does not create a second account via password signup after Google (409)", async () => {
    await google();
    const res = await request(app).post("/auth/signup").send({
      name: "Priya",
      email: "priya@howl.in",
      password: "Sup3rSecret",
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Email is already registered" });
  });

  it("rejects an email that is linked to a different Google account (409)", async () => {
    await google();
    verifyGoogleIdToken.mockResolvedValue({
      ...priyaGoogle,
      sub: "some-other-google-sub",
    });
    const res = await google();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "This email is linked to a different Google account",
    });
  });

  it("blocks a deactivated account without modifying it (401)", async () => {
    const signup = await request(app).post("/auth/signup").send({
      name: "Priya",
      email: "priya@howl.in",
      password: "Sup3rSecret",
    });
    const { User } = await import("../../../services/api/src/models");
    await User.updateOne({ _id: signup.body.user._id }, { isActive: false });

    const res = await google();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Account is deactivated" });

    // Not linked, password not cleared.
    const user = await User.findById(signup.body.user._id).select("+password");
    expect(user?.googleId).toBeUndefined();
    expect(user?.password).toBeTruthy();
  });

  it("blocks a deactivated Google-linked account on sign-in (401)", async () => {
    const first = await google();
    const { User } = await import("../../../services/api/src/models");
    await User.updateOne({ _id: first.body.user._id }, { isActive: false });

    const res = await google();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Account is deactivated" });
  });

  it("passes verifier errors through and creates no user (403 / 401 / 503)", async () => {
    const { AppError, ServiceUnavailableError, UnauthorizedError } =
      await import("../../../services/api/src/utils/errors");
    const { User } = await import("../../../services/api/src/models");

    verifyGoogleIdToken.mockRejectedValueOnce(
      new AppError("Only howl.in Google accounts can sign in", 403)
    );
    const forbidden = await google();
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({
      error: "Only howl.in Google accounts can sign in",
    });

    verifyGoogleIdToken.mockRejectedValueOnce(
      new UnauthorizedError("Invalid Google token")
    );
    expect((await google()).status).toBe(401);

    verifyGoogleIdToken.mockRejectedValueOnce(
      new ServiceUnavailableError("Google sign-in is not configured")
    );
    const unconfigured = await google();
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.body).toEqual({
      error: "Google sign-in is not configured",
    });

    expect(await User.countDocuments()).toBe(0);
  });

  it("validates the body (400) before calling Google", async () => {
    const res = await request(app).post("/auth/google").send({});
    expect(res.status).toBe(400);
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("keeps normal password signup open to any domain", async () => {
    const res = await request(app).post("/auth/signup").send({
      name: "Outside User",
      email: "someone@gmail.com",
      password: "Sup3rSecret",
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      provider: "local",
      hasPassword: true,
      googleLinked: false,
    });
  });
});
