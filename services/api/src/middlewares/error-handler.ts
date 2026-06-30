import type { NextFunction, Request, Response } from "express";
import { createLogger } from "@csat/shared";
import { ZodError } from "zod";
import { AppError, ValidationError } from "../utils/errors";

const log = createLogger("api");

/**
 * Centralised error handler — must be the last `app.use`. Logs full detail
 * server-side, returns appropriate error messages based on error type.
 *
 * Handles:
 * - AppError instances: Returns the defined status code and message
 * - ZodError instances: Converts to 400 ValidationError
 * - Other errors: Returns generic 500 to prevent information leakage
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the full error details server-side for debugging
  log.error("Request error", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    isOperational: err instanceof AppError ? err.isOperational : false,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    // Format Zod errors into a readable message
    const errorMessages = err.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return `${path}: ${issue.message}`;
      })
      .join(", ");

    // Convert to ValidationError
    const validationError = new ValidationError(
      `Validation failed - ${errorMessages}`
    );

    // Send validation error response
    res.status(validationError.statusCode).json({
      error: validationError.message,
      // Include detailed errors in development
      ...(process.env.NODE_ENV === "development" && {
        details: err.issues,
        stack: err.stack,
      }),
    });
    return;
  }

  // Check if this is one of our custom AppError instances
  if (err instanceof AppError) {
    // Only expose the real message for client (4xx) errors that are also
    // operational (expected). 5xx AppErrors are server faults, and a
    // non-operational 4xx is a programming error — both can leak internal
    // details, so send a generic message instead.
    const isClientError = err.statusCode < 500;
    res.status(err.statusCode).json({
      error:
        isClientError && err.isOperational
          ? err.message
          : "Internal Server Error",
      // In development, you might want to include more details
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  } else {
    // For unexpected errors, send generic message to avoid leaking internals
    res.status(500).json({
      error: "Internal Server Error",
      // In development, include the actual error for debugging
      ...(process.env.NODE_ENV === "development" && {
        message: err.message,
        stack: err.stack,
      }),
    });
  }
}
