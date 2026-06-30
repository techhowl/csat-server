import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  refreshSchema,
} from "../../../../services/api/src/dto/auth.dto";

// Pure Zod schemas — no config, no DB. We assert both the happy path
// (normalisation) and every rejection branch so the regex/refine/strict
// lines are all exercised.
describe("auth DTOs", () => {
  describe("signupSchema", () => {
    it("accepts a valid body and normalises email (trim + lowercase)", () => {
      const out = signupSchema.parse({
        name: "  Ada Lovelace  ",
        email: "  User@Example.COM ",
        password: "hunter2pass",
        mobileNumber: "+919876543210",
      });
      expect(out.email).toBe("user@example.com");
      expect(out.name).toBe("Ada Lovelace");
    });

    it("makes mobileNumber optional", () => {
      const out = signupSchema.parse({
        name: "Ada",
        email: "a@b.com",
        password: "hunter2pass",
      });
      expect(out.mobileNumber).toBeUndefined();
    });

    it("rejects unknown keys (mass-assignment defense)", () => {
      expect(() =>
        signupSchema.parse({
          name: "Ada",
          email: "a@b.com",
          password: "hunter2pass",
          role: "admin",
        })
      ).toThrow();
    });

    it("rejects a too-short name", () => {
      expect(() =>
        signupSchema.parse({
          name: "A",
          email: "a@b.com",
          password: "hunter2pass",
        })
      ).toThrow(/at least 2/);
    });

    it("rejects a password with no number", () => {
      expect(() =>
        signupSchema.parse({
          name: "Ada",
          email: "a@b.com",
          password: "onlyletters",
        })
      ).toThrow(/at least one number/);
    });

    it("rejects a password with no letter", () => {
      expect(() =>
        signupSchema.parse({
          name: "Ada",
          email: "a@b.com",
          password: "12345678",
        })
      ).toThrow(/at least one letter/);
    });

    it("rejects a password over 72 UTF-8 bytes", () => {
      // 73 single-byte chars (with a digit) blows the bcrypt cap.
      const long = "a".repeat(72) + "1";
      expect(() =>
        signupSchema.parse({ name: "Ada", email: "a@b.com", password: long })
      ).toThrow(/72 bytes/);
    });

    it("rejects an invalid email format", () => {
      expect(() =>
        signupSchema.parse({
          name: "Ada",
          email: "not-an-email",
          password: "hunter2pass",
        })
      ).toThrow(/valid email/);
    });

    it("rejects an invalid mobile number", () => {
      expect(() =>
        signupSchema.parse({
          name: "Ada",
          email: "a@b.com",
          password: "hunter2pass",
          mobileNumber: "0123",
        })
      ).toThrow(/E\.164/);
    });
  });

  describe("loginSchema", () => {
    it("accepts email + non-empty password", () => {
      const out = loginSchema.parse({ email: "A@B.com", password: "x" });
      expect(out.email).toBe("a@b.com");
    });

    it("rejects an empty password", () => {
      expect(() =>
        loginSchema.parse({ email: "a@b.com", password: "" })
      ).toThrow();
    });

    it("does NOT enforce the strong-password policy on login", () => {
      // "short" would fail signup, but login only checks presence.
      expect(() =>
        loginSchema.parse({ email: "a@b.com", password: "short" })
      ).not.toThrow();
    });
  });

  describe("refreshSchema", () => {
    it("accepts a non-empty refreshToken", () => {
      expect(refreshSchema.parse({ refreshToken: "abc" }).refreshToken).toBe(
        "abc"
      );
    });

    it("rejects an empty refreshToken", () => {
      expect(() => refreshSchema.parse({ refreshToken: "" })).toThrow();
    });

    it("rejects unknown keys", () => {
      expect(() =>
        refreshSchema.parse({ refreshToken: "abc", extra: 1 })
      ).toThrow();
    });
  });
});
