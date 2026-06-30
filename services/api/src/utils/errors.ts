/**
 * Base custom error class that extends the native Error class.
 * Provides a foundation for all application-specific errors with
 * proper stack trace capture and prototype chain setup.
 */
export class AppError extends Error {
  // HTTP status code to be sent in the response
  public readonly statusCode: number;

  // Flag to indicate if this error is operational (expected) vs programming error
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    // Call parent Error constructor with the message
    super(message);

    // Set the name property to the actual class name for better debugging
    this.name = this.constructor.name;

    // Store the HTTP status code
    this.statusCode = statusCode;

    // Mark whether this is an operational error
    this.isOperational = isOperational;

    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Captures stack trace, excluding the constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when request data fails validation.
 * Used for invalid input, missing required fields, or data format issues.
 * Returns HTTP 400 Bad Request status.
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    // Call parent constructor with message and 400 status code
    super(message, 400);
  }
}

/**
 * Error thrown when authentication fails or is missing.
 * Used for invalid credentials, missing tokens, or expired sessions.
 * Returns HTTP 401 Unauthorized status.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    // Call parent constructor with message and 401 status code
    super(message, 401);
  }
}

/**
 * Error thrown when a resource is not found.
 * Used for missing database records, files, or endpoints.
 * Returns HTTP 404 Not Found status.
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    // Call parent constructor with message and 404 status code
    super(message, 404);
  }
}

/**
 * Error thrown when a request conflicts with current state.
 * Used for duplicate entries, version conflicts, or business rule violations.
 * Returns HTTP 409 Conflict status.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    // Call parent constructor with message and 409 status code
    super(message, 409);
  }
}
