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

// PATCH /auth/me against real Mongo. Only Google token verification is mocked,
// to create a Google-only (no password) account for the "set password" cases.
const { verifyGoogleIdToken } = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
}));
vi.mock("../../../services/api/src/utils/google", () => ({
  verifyGoogleIdToken,
}));

describeIntegration("PATCH /auth/me against real Mongo", () => {
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
    verifyGoogleIdToken.mockResolvedValue({
      sub: "google-sub-priya",
      email: "priya@howl.in",
      name: "Priya Sharma",
    });
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

  // JWT `iat` has whole-second precision and authenticate only rejects tokens
  // from a second *before* the revoke. Waiting for the next second makes
  // "an older device's token" deterministic.
  async function nextSecond(): Promise<void> {
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 20));
  }

  const EMAIL = "ravi@example.com";
  const PASSWORD = "OldPassw0rd";

  async function signupLocal() {
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "Ravi Kumar", email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(201);
    return res.body as {
      user: { _id: string };
      tokens: { accessToken: string; refreshToken: string };
    };
  }

  async function signupGoogle() {
    const res = await request(app)
      .post("/auth/google")
      .send({ idToken: "google-id-token" });
    expect(res.status).toBe(201);
    expect(res.body.user.hasPassword).toBe(false);
    return res.body as {
      user: { _id: string };
      tokens: { accessToken: string; refreshToken: string };
    };
  }

  const patchMe = (accessToken: string, body: object) =>
    request(app)
      .patch("/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(body);

  const me = (accessToken: string) =>
    request(app).get("/auth/me").set("Authorization", `Bearer ${accessToken}`);

  const login = (password: string, email = EMAIL) =>
    request(app).post("/auth/login").send({ email, password });

  const refresh = (refreshToken: string) =>
    request(app).post("/auth/refresh").send({ refreshToken });

  async function storedUser(id: string) {
    const { User } = await import("../../../services/api/src/models");
    return User.findById(id).select("+password").lean().exec();
  }

  it("updates profile fields without touching sessions or returning tokens", async () => {
    const { tokens } = await signupLocal();

    const res = await patchMe(tokens.accessToken, {
      name: "  Ravi K.  ",
      mobileNumber: "+919876543210",
      profileImage: "https://cdn.example.com/ravi.png",
    });

    expect(res.status).toBe(200);
    expectMatchesSchema(res.body, "UpdateProfileResponse");
    expectMatchesSchema(res.body.user, "User");
    expect(res.body).not.toHaveProperty("tokens");
    expect(res.body.user).toMatchObject({
      name: "Ravi K.",
      mobileNumber: "+919876543210",
      profileImage: "https://cdn.example.com/ravi.png",
      email: EMAIL,
      hasPassword: true,
    });

    // Persisted, and the existing session keeps working.
    expect((await me(tokens.accessToken)).body.user.name).toBe("Ravi K.");
    expect((await refresh(tokens.refreshToken)).status).toBe(200);
  });

  it("removes mobileNumber and profileImage with null", async () => {
    const { tokens, user } = await signupLocal();
    await patchMe(tokens.accessToken, {
      mobileNumber: "+919876543210",
      profileImage: "https://cdn.example.com/ravi.png",
    });

    const res = await patchMe(tokens.accessToken, {
      mobileNumber: null,
      profileImage: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty("mobileNumber");
    expect(res.body.user.profileImage).toBeNull();
    const doc = await storedUser(user._id);
    expect(doc).not.toHaveProperty("mobileNumber");
  });

  it("sets a first password on a Google-only account and logs out other devices", async () => {
    const first = await signupGoogle();
    // A second device signed in with Google too.
    const second = (
      await request(app).post("/auth/google").send({ idToken: "t" })
    ).body;
    await nextSecond();

    const res = await patchMe(first.tokens.accessToken, {
      newPassword: "NewPassw0rd",
    });

    expect(res.status).toBe(200);
    expectMatchesSchema(res.body, "UpdateProfileResponse");
    expectMatchesSchema(res.body.tokens, "AuthTokens");
    expect(res.body.user).toMatchObject({
      hasPassword: true,
      googleLinked: true,
    });

    // Stored as a bcrypt hash, never the plain text.
    const doc = await storedUser(first.user._id);
    expect(doc?.password).toMatch(/^\$2[aby]\$12\$/);

    // Password login now works on the same account.
    const pw = await login("NewPassw0rd", "priya@howl.in");
    expect(pw.status).toBe(200);
    expect(pw.body.user._id).toBe(first.user._id);

    // Every earlier session is dead: refresh tokens and access tokens.
    for (const old of [first.tokens, second.tokens]) {
      expect((await refresh(old.refreshToken)).status).toBe(401);
      const r = await me(old.accessToken);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: "Session has been revoked" });
    }

    // The fresh pair from the response works.
    expect((await me(res.body.tokens.accessToken)).status).toBe(200);
    expect((await refresh(res.body.tokens.refreshToken)).status).toBe(200);
  });

  it("changes the password after verifying the current one", async () => {
    const { tokens, user } = await signupLocal();
    const otherDevice = (await login(PASSWORD)).body.tokens;
    await nextSecond();

    const res = await patchMe(tokens.accessToken, {
      currentPassword: PASSWORD,
      newPassword: "NewPassw0rd",
    });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.user._id).toBe(user._id);

    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login("NewPassw0rd")).status).toBe(200);

    expect((await me(otherDevice.accessToken)).status).toBe(401);
    expect((await refresh(otherDevice.refreshToken)).status).toBe(401);
    expect((await me(res.body.tokens.accessToken)).status).toBe(200);
  });

  it("rejects password-rule violations with 400 and changes nothing", async () => {
    const { tokens, user } = await signupLocal();
    const before = await storedUser(user._id);

    const cases: Array<[object, string]> = [
      [
        {
          name: "Hacked",
          currentPassword: "WrongPassw0rd",
          newPassword: "NewPassw0rd",
        },
        "Current password is incorrect",
      ],
      [
        { name: "Hacked", newPassword: "NewPassw0rd" },
        "currentPassword is required to change the password",
      ],
      [
        { currentPassword: PASSWORD, newPassword: PASSWORD },
        "New password must be different from the current password",
      ],
    ];
    for (const [body, error] of cases) {
      const res = await patchMe(tokens.accessToken, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toEqual({ error });
    }

    // Nothing was written — not even the name sent alongside a bad password —
    // and the session is still valid.
    const after = await storedUser(user._id);
    expect(after?.name).toBe("Ravi Kumar");
    expect(after?.password).toBe(before?.password);
    expect((await me(tokens.accessToken)).status).toBe(200);
    expect((await login(PASSWORD)).status).toBe(200);
  });

  it("rejects currentPassword on an account that has no password (400)", async () => {
    const { tokens } = await signupGoogle();
    const res = await patchMe(tokens.accessToken, {
      currentPassword: "anything1",
      newPassword: "NewPassw0rd",
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "No password is set for this account — omit currentPassword",
    });
  });

  it("lets only one of two concurrent first-password sets win (200 + 409)", async () => {
    const { tokens } = await signupGoogle();

    const results = await Promise.all([
      patchMe(tokens.accessToken, { newPassword: "FirstPassw0rd" }),
      patchMe(tokens.accessToken, { newPassword: "SecondPassw0rd" }),
    ]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body).toEqual({
      error: "Password was changed by another request; reload and try again",
    });
  });

  it("validates the body (400) and never accepts server-owned fields", async () => {
    const { tokens, user } = await signupLocal();

    for (const body of [
      {},
      { role: "admin" },
      { email: "other@example.com" },
      { _id: "507f1f77bcf86cd799439011", name: "X Y" },
      { isActive: false },
      { profileImage: "javascript:alert(1)" },
      { currentPassword: PASSWORD },
      { newPassword: "weak" },
    ]) {
      const res = await patchMe(tokens.accessToken, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }

    const doc = await storedUser(user._id);
    expect(doc).toMatchObject({ role: "user", email: EMAIL, isActive: true });
  });

  it("requires a valid access token and an active account (401)", async () => {
    const { tokens, user } = await signupLocal();

    expect(
      (await request(app).patch("/auth/me").send({ name: "No Token" })).status
    ).toBe(401);

    const { User } = await import("../../../services/api/src/models");
    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });
    const res = await patchMe(tokens.accessToken, { name: "Still Me" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Account is deactivated" });
  });

  it("only ever updates the token owner, never another user", async () => {
    const ravi = await signupLocal();
    const other = await request(app).post("/auth/signup").send({
      name: "Other Person",
      email: "other@example.com",
      password: "Passw0rdX",
    });

    await patchMe(ravi.tokens.accessToken, { name: "Ravi Updated" });

    expect((await storedUser(ravi.user._id))?.name).toBe("Ravi Updated");
    expect((await storedUser(other.body.user._id))?.name).toBe("Other Person");
  });
});
