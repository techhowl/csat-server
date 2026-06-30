import { describe, it, expect, afterEach } from "vitest";
import jwt from "jsonwebtoken";

// Stub @csat/shared so jwt.ts doesn't try to load real Infisical secrets at
// import time. The values just need to be stable for sign/verify round-trips.
vi.mock("@csat/shared", () => ({
  config: {
    jwt: {
      accessSecret: "test-access-secret",
      refreshSecret: "test-refresh-secret",
      accessTtl: "15m",
      refreshTtl: "30d",
    },
  },
}));

import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} from "../../../../services/api/src/utils/jwt";

describe("jwt utils", () => {
  describe("access token round-trip", () => {
    it("signs then verifies, preserving userId", () => {
      const token = signAccessToken({ userId: "u1" });
      expect(typeof token).toBe("string");
      expect(verifyAccessToken(token).userId).toBe("u1");
    });

    it("rejects a garbage token with UnauthorizedError (401)", () => {
      expect(() => verifyAccessToken("not.a.jwt")).toThrow(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it("rejects a token signed with the wrong secret", () => {
      const bad = jwt.sign({ userId: "u1" }, "wrong-secret", {
        issuer: "csat-api",
      });
      expect(() => verifyAccessToken(bad)).toThrow(/Invalid access token/);
    });

    it("rejects an expired token", () => {
      const expired = jwt.sign({ userId: "u1" }, "test-access-secret", {
        issuer: "csat-api",
        expiresIn: -10,
      });
      expect(() => verifyAccessToken(expired)).toThrow(/Invalid access token/);
    });

    it("rejects an access token presented as a refresh token (secret mismatch)", () => {
      const access = signAccessToken({ userId: "u1" });
      expect(() => verifyRefreshToken(access)).toThrow(
        expect.objectContaining({ statusCode: 401 })
      );
    });
  });

  describe("refresh token round-trip", () => {
    it("signs then verifies, preserving userId", () => {
      const token = signRefreshToken({ userId: "u9" });
      expect(verifyRefreshToken(token).userId).toBe("u9");
    });

    it("rejects garbage with UnauthorizedError", () => {
      expect(() => verifyRefreshToken("x.y.z")).toThrow(
        /Invalid refresh token/
      );
    });
  });

  describe("verify error/catch branches", () => {
    afterEach(() => vi.restoreAllMocks());

    it("wraps a string payload as UnauthorizedError (access)", () => {
      // jwt.verify returns a string when the token payload is a string. The
      // `typeof decoded === "string"` guard throws ValidationError, which the
      // catch then re-wraps as UnauthorizedError.
      vi.spyOn(jwt, "verify").mockReturnValue("a-string-payload" as never);
      expect(() => verifyAccessToken("whatever")).toThrow(
        /Invalid token payload format/
      );
    });

    it("wraps a string payload as UnauthorizedError (refresh)", () => {
      vi.spyOn(jwt, "verify").mockReturnValue("a-string-payload" as never);
      expect(() => verifyRefreshToken("whatever")).toThrow(
        /Invalid token payload format/
      );
    });

    it("wraps a non-JWT error via the generic catch (access)", () => {
      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new Error("kaboom"); // name 'Error', not a JWT error
      });
      expect(() => verifyAccessToken("whatever")).toThrow(
        /Failed to verify access token: kaboom/
      );
    });

    it("wraps a non-JWT error via the generic catch (refresh)", () => {
      vi.spyOn(jwt, "verify").mockImplementation(() => {
        throw new Error("kaboom");
      });
      expect(() => verifyRefreshToken("whatever")).toThrow(
        /Failed to verify refresh token: kaboom/
      );
    });

    it("wraps a sign failure as AppError (access)", () => {
      vi.spyOn(jwt, "sign").mockImplementation(() => {
        throw new Error("sign fail");
      });
      expect(() => signAccessToken({ userId: "u1" })).toThrow(
        expect.objectContaining({
          statusCode: 500,
          message: expect.stringMatching(
            /Failed to sign access token: sign fail/
          ),
        })
      );
    });

    it("wraps a sign failure as AppError (refresh)", () => {
      vi.spyOn(jwt, "sign").mockImplementation(() => {
        throw new Error("sign fail");
      });
      expect(() => signRefreshToken({ userId: "u1" })).toThrow(
        /Failed to sign refresh token: sign fail/
      );
    });
  });

  describe("hashToken", () => {
    it("produces a 64-char hex SHA-256 digest", () => {
      const h = hashToken("some-token");
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same input", () => {
      expect(hashToken("t")).toBe(hashToken("t"));
    });

    it("differs for different input", () => {
      expect(hashToken("a")).not.toBe(hashToken("b"));
    });
  });
});
