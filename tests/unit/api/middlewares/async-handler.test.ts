import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../../../../services/api/src/middlewares/async-handler";

describe("asyncHandler", () => {
  it("does not call next when the handler resolves", async () => {
    const next = vi.fn();
    const fn = vi.fn().mockResolvedValue("ok");
    asyncHandler(fn)({} as Request, {} as Response, next);
    await new Promise((r) => setImmediate(r)); // let the promise settle
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a rejected error to next()", async () => {
    const next = vi.fn();
    const boom = new Error("boom");
    asyncHandler(() => Promise.reject(boom))(
      {} as Request,
      {} as Response,
      next as NextFunction
    );
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(boom);
  });
});
