import bcrypt from "bcrypt";
import { config } from "@csat/shared";
import { AppError } from "./errors";

// Cost factor for bcrypt - higher values mean more secure but slower hashing
// 12 is a good balance between security and performance as of 2024
const COST = 12;

// Pepper value from config - adds an additional secret to all passwords
// This should be kept secret and consistent across the application
const PEPPER = config.security.passwordPepper;

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
      // Append pepper to password before hashing for additional security
      // The pepper is a server-side secret that's not stored with the hash
      const pepperedPassword = password + PEPPER;
      
      // Generate a salt and hash the peppered password
      // The salt is automatically generated and embedded in the result
      const hashedPassword = await bcrypt.hash(pepperedPassword, COST);
      
      // Return the hashed password which includes the algorithm, cost, salt, and hash
      return hashedPassword;
    } catch (error) {
      // Store the error for potential re-throw
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // If this wasn't the last attempt, wait before retrying
      if (attempt < MAX_RETRY_ATTEMPTS) {
        // Log the retry attempt for debugging purposes
        console.warn(`Password hashing attempt ${attempt} failed, retrying...`);
        
        // Wait before the next attempt to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  
  // If we've exhausted all attempts, throw an AppError
  throw new AppError(
    `Failed to hash password after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message || 'Unknown error'}`,
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
    // Append the same pepper that was used during hashing
    const pepperedPassword = password + PEPPER;
    
    // bcrypt.compare extracts the salt from the hash
    // and uses it to hash the peppered password, then compares the results
    const isMatch = await bcrypt.compare(pepperedPassword, hash);
    
    // Return boolean indicating if the passwords match
    return isMatch;
  } catch (error) {
    // Re-throw as AppError for consistent error handling
    throw new AppError(
      `Failed to compare password: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
}
