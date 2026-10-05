import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mock the model and the JWT verifier so the middleware is exercised in
// isolation — no Mongo, no real crypto. vi.mock is hoisted above imports, so
// the shared mock fns must come from vi.hoisted (also hoisted) to be in scope.
const { exec, findById, verifyAccessToken, getTokenIssuedAt } = vi.hoisted(
  () => {
    const exec = vi.fn();
    return {
      exec,
      findById: vi.fn(() => ({ select: () => ({ lean: () => ({ exec }) }) })),
      verifyAccessToken: vi.fn(),
      getTokenIssuedAt: vi.fn(),
    };
  }
);
vi.mock("../../../../services/api/src/models", () => ({
  User: { findById },
}));
vi.mock("../../../../services/api/src/utils/jwt", () => ({
  verifyAccessToken,
  getTokenIssuedAt,
}));

import {
  authenticate,
  requireRole,
} from "../../../../services/api/src/middlewares/authenticate";
import { UnauthorizedError } from "../../../../services/api/src/utils/errors";

function mkReq(headers: Record<string, string> = {}): Partial<Request> {
  return { headers } as Partial<Request>;
}

describe("authenticate middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it("rejects a missing Authorization header", async () => {
    await authenticate(mkReq() as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /header missing/
    );
  });

  it("rejects a non-Bearer scheme", async () => {
    await authenticate(
      mkReq({ authorization: "Basic abc" }) as Request,
      {} as Response,
      next
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /Invalid authorization format/
    );
  });

  it("rejects an empty token after 'Bearer '", async () => {
    await authenticate(
      mkReq({ authorization: "Bearer " }) as Request,
      {} as Response,
      next
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /Access token missing/
    );
  });

  it("rejects a payload with no user id", async () => {
    verifyAccessToken.mockReturnValue({});
    await authenticate(
      mkReq({ authorization: "Bearer good" }) as Request,
      {} as Response,
      next
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /missing user ID/
    );
  });

  it("rejects when the user is not found", async () => {
    verifyAccessToken.mockReturnValue({ userId: "u1" });
    exec.mockResolvedValue(null);
    await authenticate(
      mkReq({ authorization: "Bearer good" }) as Request,
      {} as Response,
      next
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /User not found/
    );
  });

  it("rejects a deactivated account", async () => {
    verifyAccessToken.mockReturnValue({ userId: "u1" });
    exec.mockResolvedValue({ _id: "u1", isActive: false });
    await authenticate(
      mkReq({ authorization: "Bearer good" }) as Request,
      {} as Response,
      next
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toMatch(
      /deactivated/
    );
  });

  it("attaches the user and calls next() on success", async () => {
    const user = { _id: "u1", isActive: true, role: "user" };
    verifyAccessToken.mockReturnValue({ userId: "u1" });
    exec.mockResolvedValue(user);
    const req = mkReq({ authorization: "Bearer good" }) as Request;
    await authenticate(req, {} as Response, next);
    expect((req as unknown as { user: unknown }).user).toEqual(user);
    expect(next).toHaveBeenCalledWith();
  });

  describe("sessionsRevokedAt", () => {
    // Revoked at 10:00:05.700 — the revoke's second starts at 10:00:05.000.
    const revokedAt = new Date("2026-10-05T10:00:05.700Z");

    async function run(issuedAt: string) {
      verifyAccessToken.mockReturnValue({ userId: "u1" });
      getTokenIssuedAt.mockReturnValue(new Date(issuedAt));
      exec.mockResolvedValue({
        _id: "u1",
        isActive: true,
        sessionsRevokedAt: revokedAt,
      });
      const req = mkReq({ authorization: "Bearer good" }) as Request;
      await authenticate(req, {} as Response, next);
      return req as unknown as { user?: unknown };
    }

    it("rejects a token issued before the revoke", async () => {
      const req = await run("2026-10-05T10:00:04.000Z");
      expect(req.user).toBeUndefined();
      expect(
        (next as ReturnType<typeof vi.fn>).mock.calls[0][0].message
      ).toMatch(/Session has been revoked/);
    });

    it("accepts a token issued in the revoke's second (the fresh pair)", async () => {
      const req = await run("2026-10-05T10:00:05.000Z");
      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalledWith();
    });

    it("accepts a token issued after the revoke", async () => {
      await run("2026-10-05T10:01:00.000Z");
      expect(next).toHaveBeenCalledWith();
    });

    it("skips the check when the user was never revoked", async () => {
      verifyAccessToken.mockReturnValue({ userId: "u1" });
      exec.mockResolvedValue({ _id: "u1", isActive: true });
      await authenticate(
        mkReq({ authorization: "Bearer good" }) as Request,
        {} as Response,
        next
      );
      expect(getTokenIssuedAt).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });
});

describe("requireRole middleware", () => {
  let next: NextFunction;
  beforeEach(() => {
    next = vi.fn();
  });

  it("throws when there is no authenticated user", () => {
    expect(() =>
      requireRole(["admin"])({} as Request, {} as Response, next)
    ).toThrow(/Authentication required/);
  });

  it("throws when the role is not allowed", () => {
    const req = { user: { role: "user" } } as unknown as Request;
    expect(() => requireRole(["admin"])(req, {} as Response, next)).toThrow(
      /Insufficient permissions/
    );
  });

  it("calls next() when the role is allowed", () => {
    const req = { user: { role: "admin" } } as unknown as Request;
    requireRole(["admin", "manager"])(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
