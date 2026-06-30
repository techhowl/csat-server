import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { errorHandler } from "../../../../services/api/src/middlewares/error-handler";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from "../../../../services/api/src/utils/errors";

// Mock the logger
vi.mock("@csat/shared", () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

// Mock NODE_ENV
vi.stubEnv("NODE_ENV", "production");

describe("errorHandler middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    mockRequest = {};
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    } as Partial<Response>;
    mockNext = vi.fn();
  });

  it("should log the error and return 500 status with generic error message", () => {
    // Arrange
    const error = new Error("Test error message");
    error.stack =
      "Error: Test error message\n    at Object.<anonymous> (/test/file.js:1:1)";

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Internal Server Error" });
  });

  it("should handle errors without stack trace", () => {
    // Arrange
    const error = new Error("Error without stack");
    delete error.stack;

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Internal Server Error" });
  });

  it("should not call next function", () => {
    // Arrange
    const error = new Error("Test error");

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should handle different error types", () => {
    // Arrange
    const customError = {
      name: "CustomError",
      message: "Custom error message",
      stack:
        "CustomError: Custom error message\n    at Object.<anonymous> (/test/file.js:1:1)",
    } as Error;

    // Act
    errorHandler(
      customError,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Internal Server Error" });
  });

  it("should always return the same generic error message to prevent information leakage", () => {
    // Arrange
    const sensitiveError = new Error(
      "Database connection failed at host:192.168.1.1"
    );

    // Act
    errorHandler(
      sensitiveError,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(jsonMock).toHaveBeenCalledWith({ error: "Internal Server Error" });
    expect(jsonMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("192.168.1.1"),
      })
    );
  });

  it("should handle errors with missing properties", () => {
    // Arrange
    const minimalError = {} as Error;

    // Act
    errorHandler(
      minimalError,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Internal Server Error" });
  });

  it("should handle ValidationError with 400 status", () => {
    // Arrange
    const error = new ValidationError("Invalid input data");

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Invalid input data" });
  });

  it("should handle UnauthorizedError with 401 status", () => {
    // Arrange
    const error = new UnauthorizedError("Authentication required");

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Authentication required" });
  });

  it("should handle NotFoundError with 404 status", () => {
    // Arrange
    const error = new NotFoundError("User not found");

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith({ error: "User not found" });
  });

  it("should handle ConflictError with 409 status", () => {
    // Arrange
    const error = new ConflictError("Email already exists");

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Email already exists" });
  });

  it("should handle AppError with custom status code", () => {
    // Arrange
    const error = new AppError("Custom error", 503);

    // Act
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert: status is preserved, but 5xx AppError messages are redacted to a
    // generic string so internal details don't leak to clients.
    expect(statusMock).toHaveBeenCalledWith(503);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Internal Server Error" });
  });

  it("should handle ZodError and convert to 400 ValidationError", () => {
    // Arrange
    const schema = z.object({
      name: z.string().min(2),
      age: z.number().positive(),
    });

    let zodError: ZodError;
    try {
      schema.parse({ name: "a", age: -5 });
    } catch (error) {
      zodError = error as ZodError;
    }

    // Act
    errorHandler(
      zodError!,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("Validation failed"),
      })
    );
  });

  it("should handle ZodError with multiple validation issues", () => {
    // Arrange
    const schema = z.object({
      email: z.email(),
      password: z.string().min(8),
      age: z.number().min(18),
    });

    let zodError: ZodError;
    try {
      schema.parse({ email: "invalid", password: "short", age: 10 });
    } catch (error) {
      zodError = error as ZodError;
    }

    // Act
    errorHandler(
      zodError!,
      mockRequest as Request,
      mockResponse as Response,
      mockNext
    );

    // Assert
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/email.*password.*age/i),
      })
    );
  });
});
