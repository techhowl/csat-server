import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  validate,
  validateQuery,
  validateParams,
} from "../../../../services/api/src/middlewares/validate";
import { ValidationError } from "../../../../services/api/src/utils/errors";

const schema = z.object({ name: z.string().trim().min(2) }).strict();

describe("validate middlewares", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {};
    next = vi.fn();
  });

  it("replaces req.body with the parsed/transformed output and calls next()", () => {
    req.body = { name: "  Ada  " };
    validate(schema)(req as Request, res as Response, next);
    expect(req.body).toEqual({ name: "Ada" }); // trimmed in place
    expect(next).toHaveBeenCalledWith();
  });

  it("throws a ValidationError with the body label on invalid input", () => {
    req.body = { name: "A" };
    expect(() =>
      validate(schema)(req as Request, res as Response, next)
    ).toThrow(ValidationError);
    expect(() =>
      validate(schema)(req as Request, res as Response, next)
    ).toThrow(/Validation failed - name:/);
  });

  it("validateQuery uses the query label", () => {
    req.query = { name: "A" } as Request["query"];
    expect(() =>
      validateQuery(schema)(req as Request, res as Response, next)
    ).toThrow(/Query validation failed -/);
  });

  it("validateParams uses the params label", () => {
    req.params = { name: "A" } as Request["params"];
    expect(() =>
      validateParams(schema)(req as Request, res as Response, next)
    ).toThrow(/Parameter validation failed -/);
  });
});
