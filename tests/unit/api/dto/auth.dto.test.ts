import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  refreshSchema,
  updateProfileSchema,
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

  describe("updateProfileSchema", () => {
    const fails = (body: unknown) =>
      updateProfileSchema.safeParse(body).success === false;

    it("trims name and accepts a single field", () => {
      expect(updateProfileSchema.parse({ name: "  Ada  " })).toEqual({
        name: "Ada",
      });
    });

    it("rejects an empty body", () => {
      expect(fails({})).toBe(true);
    });

    it("rejects server-owned fields", () => {
      for (const key of ["email", "role", "isActive", "googleId", "_id"]) {
        expect(fails({ name: "Ada", [key]: "x" })).toBe(true);
      }
    });

    it("allows null to remove mobileNumber and profileImage", () => {
      expect(
        updateProfileSchema.parse({ mobileNumber: null, profileImage: null })
      ).toEqual({ mobileNumber: null, profileImage: null });
    });

    it("accepts only https profile images", () => {
      expect(fails({ profileImage: "https://cdn.example.com/a.png" })).toBe(
        false
      );
      for (const url of [
        "http://cdn.example.com/a.png",
        "javascript:alert(1)",
        "data:image/png;base64,AAAA",
        "not a url",
      ]) {
        expect(fails({ profileImage: url })).toBe(true);
      }
    });

    it("accepts newPassword alone (first-time set)", () => {
      expect(fails({ newPassword: "Passw0rd1" })).toBe(false);
    });

    it("accepts currentPassword + newPassword (change)", () => {
      expect(
        fails({ currentPassword: "anything", newPassword: "Passw0rd1" })
      ).toBe(false);
    });

    it("rejects currentPassword without newPassword", () => {
      expect(fails({ currentPassword: "Passw0rd1" })).toBe(true);
    });

    it("applies the strong-password policy to newPassword", () => {
      expect(fails({ newPassword: "short1" })).toBe(true);
      expect(fails({ newPassword: "nodigitshere" })).toBe(true);
      expect(fails({ newPassword: "x1".repeat(40) })).toBe(true);
    });

    it("rejects an invalid mobile number", () => {
      expect(fails({ mobileNumber: "12" })).toBe(true);
    });
  });
});
