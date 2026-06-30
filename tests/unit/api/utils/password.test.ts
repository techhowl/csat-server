import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcrypt";

// password.ts reads config.security.passwordPepper at import time and logs via
// createLogger — stub both so no real secrets/logger are needed.
vi.mock("@csat/shared", () => ({
  config: { security: { passwordPepper: "test-pepper" } },
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  hashPassword,
  comparePassword,
} from "../../../../services/api/src/utils/password";

describe("password utils", () => {
  it("hashes to a bcrypt string distinct from the input", async () => {
    const hash = await hashPassword("hunter2pass");
    expect(hash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12
    expect(hash).not.toBe("hunter2pass");
  });

  it("uses a random salt — same password hashes differently", async () => {
    const [a, b] = await Promise.all([
      hashPassword("samepass1"),
      hashPassword("samepass1"),
    ]);
    expect(a).not.toBe(b);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse1");
    expect(await comparePassword("correct-horse1", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse1");
    expect(await comparePassword("battery-staple2", hash)).toBe(false);
  });

  it("returns false (not throw) for a malformed hash", async () => {
    expect(await comparePassword("anything1", "not-a-bcrypt-hash")).toBe(false);
  });

  describe("error/catch branches", () => {
    afterEach(() => vi.restoreAllMocks());

    it("throws AppError(500) after exhausting all hash retries", async () => {
      // Force every bcrypt.hash attempt to fail -> retry loop logs, then throws.
      vi.spyOn(bcrypt, "hash").mockRejectedValue(
        new Error("hash fail") as never
      );
      await expect(hashPassword("hunter2pass")).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringMatching(
          /Failed to hash password after 3 attempts/
        ),
      });
    });

    it("re-throws compare failures as AppError(500)", async () => {
      vi.spyOn(bcrypt, "compare").mockRejectedValue(
        new Error("cmp fail") as never
      );
      await expect(
        comparePassword("pw1aaaaa", "$2b$12$whatever")
      ).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringMatching(/Failed to compare password: cmp fail/),
      });
    });
  });
});
