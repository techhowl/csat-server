import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Google's client so no network calls happen; each test decides what
// verifyIdToken resolves (a ticket) or rejects with. `googleConfig` is mutable
// so tests can flip the client ID / allowed domains.
const { verifyIdToken, googleConfig } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  googleConfig: {
    clientId: "test-client.apps.googleusercontent.com",
    allowedDomains: ["howl.in"],
  },
}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));
vi.mock("@csat/shared", () => ({ config: { google: googleConfig } }));

import { verifyGoogleIdToken } from "../../../../services/api/src/utils/google";

// A valid howl.in Workspace payload; tests override single claims.
function payload(overrides: Record<string, unknown> = {}) {
  return {
    sub: "google-sub-123",
    email: "Priya@Howl.in",
    email_verified: true,
    hd: "howl.in",
    name: "Priya Sharma",
    picture: "https://lh3.googleusercontent.com/a/photo",
    ...overrides,
  };
}
function resolvesWith(p: Record<string, unknown> | undefined) {
  verifyIdToken.mockResolvedValue({ getPayload: () => p });
}

describe("verifyGoogleIdToken", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    googleConfig.clientId = "test-client.apps.googleusercontent.com";
    googleConfig.allowedDomains = ["howl.in"];
  });

  it("returns the identity for a verified howl.in Workspace account", async () => {
    resolvesWith(payload());
    await expect(verifyGoogleIdToken("id-token")).resolves.toEqual({
      sub: "google-sub-123",
      email: "priya@howl.in", // lowercased
      name: "Priya Sharma",
      picture: "https://lh3.googleusercontent.com/a/photo",
    });
    // Audience is pinned to our client ID.
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "id-token",
      audience: "test-client.apps.googleusercontent.com",
    });
  });

  it("falls back to the email local part when Google sends no name", async () => {
    resolvesWith(payload({ name: undefined }));
    const identity = await verifyGoogleIdToken("id-token");
    expect(identity.name).toBe("priya");
  });

  it("rejects a personal Google account (no hd claim) with 403", async () => {
    resolvesWith(payload({ email: "priya@gmail.com", hd: undefined }));
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 403,
      message: "Only howl.in Google accounts can sign in",
    });
  });

  it("rejects another Workspace domain with 403", async () => {
    resolvesWith(payload({ email: "a@other.com", hd: "other.com" }));
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects when the email domain doesn't match the hd claim", async () => {
    resolvesWith(payload({ email: "a@evil.com", hd: "howl.in" }));
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects an unverified email with 403", async () => {
    resolvesWith(payload({ email_verified: false }));
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("maps any verification failure to a generic 401", async () => {
    verifyIdToken.mockRejectedValue(
      new Error("Wrong recipient, payload audience != requiredAudience")
    );
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid Google token",
    });
  });

  it("rejects a payload without sub or email with 401", async () => {
    resolvesWith(payload({ email: undefined }));
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 401,
    });
    resolvesWith(undefined);
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("returns 503 without calling Google when GOOGLE_CLIENT_ID is empty", async () => {
    googleConfig.clientId = "";
    await expect(verifyGoogleIdToken("t")).rejects.toMatchObject({
      statusCode: 503,
      message: "Google sign-in is not configured",
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("accepts any of several allowed domains", async () => {
    googleConfig.allowedDomains = ["howl.in", "partner.org"];
    resolvesWith(payload({ email: "x@partner.org", hd: "partner.org" }));
    await expect(verifyGoogleIdToken("t")).resolves.toMatchObject({
      email: "x@partner.org",
    });
  });
});
