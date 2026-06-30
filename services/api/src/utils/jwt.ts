import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { config } from "@csat/shared";
import { AppError, UnauthorizedError, ValidationError } from "./errors";

/**
 * Allowlisted JWT payload. `userId` is the single identity claim this service
 * issues and reads — it is required, and `verify*Token` enforces that it is a
 * string before returning, so callers never have to fall back to other claims.
 */
export interface TokenPayload {
  userId: string;
}

/**
 * Signs an access token with a short lifetime for API authentication.
 * Access tokens are used for regular API requests and should be short-lived.
 *
 * @param payload - The data to encode in the token (e.g., userId, email)
 * @returns The signed JWT access token as a string
 * @throws Error if signing fails
 */
export function signAccessToken(payload: TokenPayload): string {
  try {
    // Sign the token with the access secret and configured TTL
    // The token will automatically expire after the TTL
    const token = jwt.sign(
      // Explicit allowlist — only the opaque user ID goes into the token.
      // Never spread the whole payload object: that could silently leak PII
      // if extra fields are added to TokenPayload later.
      { userId: payload.userId },
      config.jwt.accessSecret,
      {
        // Set expiration time from config (default: 15m)
        expiresIn: config.jwt.accessTtl as SignOptions["expiresIn"],
        // Include issuer for token validation
        issuer: "csat-api",
      }
    );

    return token;
  } catch (error) {
    // Re-throw as AppError for consistent error handling
    throw new AppError(
      `Failed to sign access token: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}

/**
 * Signs a refresh token with a longer lifetime for token renewal.
 * Refresh tokens are used to obtain new access tokens without re-authentication.
 *
 * @param payload - The data to encode in the token (typically just userId)
 * @returns The signed JWT refresh token as a string
 * @throws Error if signing fails
 */
export function signRefreshToken(payload: TokenPayload): string {
  try {
    // Sign the token with the refresh secret and configured TTL
    // Refresh tokens have longer lifetime than access tokens
    const token = jwt.sign(
      // Explicit allowlist — only the opaque user ID goes into the token.
      { userId: payload.userId },
      config.jwt.refreshSecret,
      {
        // Set expiration time from config (default: 30d)
        expiresIn: config.jwt.refreshTtl as SignOptions["expiresIn"],
        // Include issuer for token validation
        issuer: "csat-api",
      }
    );

    return token;
  } catch (error) {
    // Re-throw as AppError for consistent error handling
    throw new AppError(
      `Failed to sign refresh token: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}

/**
 * Verifies and decodes an access token.
 * Checks signature, expiration, and issuer.
 *
 * @param token - The JWT access token to verify
 * @returns The decoded token payload
 * @throws Error if verification fails (invalid signature, expired, etc.)
 */
export function verifyAccessToken(token: string): TokenPayload {
  try {
    // Verify the token using the access secret
    // This will throw if the token is invalid, expired, or has wrong signature
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      // Verify the issuer matches
      issuer: "csat-api",
    });

    // Ensure we got an object payload, not a string
    if (typeof decoded === "string") {
      throw new ValidationError("Invalid token payload format");
    }

    // Validate the identity claim at the boundary rather than casting blindly:
    // a token without a string userId is not a valid identity for this service.
    if (typeof decoded.userId !== "string") {
      throw new UnauthorizedError("Invalid token payload: missing user ID");
    }

    // Narrow to our allowlisted payload shape
    return { userId: decoded.userId };
  } catch (error) {
    // Check if it's a JWT-specific error
    if (error instanceof Error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      ) {
        // These are authorization failures
        throw new UnauthorizedError(`Invalid access token: ${error.message}`);
      }
    }
    // Re-throw as UnauthorizedError for token verification failures
    throw new UnauthorizedError(
      `Failed to verify access token: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Verifies and decodes a refresh token.
 * Checks signature, expiration, and issuer.
 *
 * @param token - The JWT refresh token to verify
 * @returns The decoded token payload
 * @throws Error if verification fails (invalid signature, expired, etc.)
 */
export function verifyRefreshToken(token: string): TokenPayload {
  try {
    // Verify the token using the refresh secret
    // This will throw if the token is invalid, expired, or has wrong signature
    const decoded = jwt.verify(token, config.jwt.refreshSecret, {
      // Verify the issuer matches
      issuer: "csat-api",
    });

    // Ensure we got an object payload, not a string
    if (typeof decoded === "string") {
      throw new ValidationError("Invalid token payload format");
    }

    // Validate the identity claim at the boundary rather than casting blindly.
    if (typeof decoded.userId !== "string") {
      throw new UnauthorizedError("Invalid token payload: missing user ID");
    }

    // Narrow to our allowlisted payload shape
    return { userId: decoded.userId };
  } catch (error) {
    // Check if it's a JWT-specific error
    if (error instanceof Error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      ) {
        // These are authorization failures
        throw new UnauthorizedError(`Invalid refresh token: ${error.message}`);
      }
    }
    // Re-throw as UnauthorizedError for token verification failures
    throw new UnauthorizedError(
      `Failed to verify refresh token: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Creates a SHA-256 hash of a token for secure storage.
 * Used when storing refresh tokens in the database to avoid storing them in plain text.
 *
 * @param token - The token to hash
 * @returns The SHA-256 hash of the token as a hex string
 */
export function hashToken(token: string): string {
  // Create a SHA-256 hash of the token
  // This is one-way: we can't recover the original token from the hash
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  return hash;
}
