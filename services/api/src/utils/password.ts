import crypto from "crypto";
import bcrypt from "bcrypt";
import { config, createLogger } from "@csat/shared";
import { AppError } from "./errors";

const log = createLogger("api");

// Cost factor for bcrypt - higher values mean more secure but slower hashing
// 12 is a good balance between security and performance as of 2024
const COST = 12;

// Pepper value from config - adds an additional secret to all passwords
// This should be kept secret and consistent across the application
const PEPPER = config.security.passwordPepper;

/**
 * Pre-hashes the password to a fixed-length value before bcrypt using
 * HMAC-SHA256 keyed by the pepper. bcrypt silently truncates input past 72
 * bytes, so appending the pepper to the raw password could push the pepper (or
 * part of a long/multibyte password) past the cap and lose it. HMAC produces a
 * constant 44-byte base64 digest that always mixes in the pepper and stays well
 * under bcrypt's limit, regardless of input length.
 */
function prehashPassword(password: string): string {
  return crypto
    .createHmac("sha256", PEPPER)
    .update(password, "utf8")
    .digest("base64");
}

// Maximum number of retry attempts for password hashing
const MAX_RETRY_ATTEMPTS = 3;

// Delay between retry attempts in milliseconds
const RETRY_DELAY_MS = 100;

/**
 * Hashes a plain text password using bcrypt with a cost factor of 12 and a pepper.
 * The pepper adds an additional layer of security beyond the salt.
 * Includes retry logic with up to 3 attempts in case of failure.
 *
 * @param password - The plain text password to hash
 * @returns Promise resolving to the hashed password string
 * @throws Error if hashing fails after all retry attempts
 */
export async function hashPassword(password: string): Promise<string> {
  // Track the last error for error reporting
  let lastError: Error | null = null;

  // Attempt to hash the password with retries
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      // Pre-hash with the pepper-keyed HMAC so the bcrypt input is fixed-length
      // and the pepper is always included, regardless of password length.
      const prehashed = prehashPassword(password);

      // Generate a salt and hash the pre-hashed password
      // The salt is automatically generated and embedded in the result
      const hashedPassword = await bcrypt.hash(prehashed, COST);

      // Return the hashed password which includes the algorithm, cost, salt, and hash
      return hashedPassword;
    } catch (error) {
      // Store the error for potential re-throw
      lastError = error instanceof Error ? error : new Error("Unknown error");

      // If this wasn't the last attempt, wait before retrying
      if (attempt < MAX_RETRY_ATTEMPTS) {
        // Log the retry attempt for debugging purposes
        log.warn("Password hashing attempt failed, retrying", { attempt });

        // Wait before the next attempt to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // If we've exhausted all attempts, throw an AppError
  throw new AppError(
    `Failed to hash password after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message || "Unknown error"}`,
    500
  );
}

/**
 * Compares a plain text password against a hashed password.
 * Adds the pepper before comparison for consistency with hashing.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param password - The plain text password to verify
 * @param hash - The hashed password to compare against
 * @returns Promise resolving to true if passwords match, false otherwise
 * @throws Error if comparison fails
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    // Apply the same pepper-keyed HMAC pre-hash used during hashing
    const prehashed = prehashPassword(password);

    // bcrypt.compare extracts the salt from the hash
    // and uses it to hash the pre-hashed password, then compares the results
    const isMatch = await bcrypt.compare(prehashed, hash);

    // Return boolean indicating if the passwords match
    return isMatch;
  } catch (error) {
    // Re-throw as AppError for consistent error handling
    throw new AppError(
      `Failed to compare password: ${error instanceof Error ? error.message : "Unknown error"}`,
      500
    );
  }
}
