import { z } from "zod";

/**
 * Auth request DTOs (Data Transfer Objects).
 *
 * These Zod schemas are the input contract for the auth endpoints. They are
 * consumed by the `validate(schema)` middleware (see middlewares/validate.ts),
 * which runs `schema.parse(req.body)`, replaces `req.body` with the parsed and
 * normalised output, and converts any `ZodError` into a `ValidationError`
 * (400) that flows through the centralised error handler.
 *
 * Design rules enforced here:
 * - `.strict()` on every object — unknown keys are REJECTED rather than
 *   silently dropped. This is mass-assignment defense: a client cannot smuggle
 *   `role`, `accessScopes`, `isActive`, or `provider` into a signup body to
 *   escalate privileges. Those fields are owned by the server, never the wire.
 * - Inputs are normalised (trim + lowercase email) before they ever reach the
 *   service layer, so persistence sees canonical values.
 * - Password is capped at 72 bytes because bcrypt silently truncates input
 *   beyond 72 bytes (see utils/password.ts). The cap is enforced on the UTF-8
 *   byte length, not the character count, so multibyte passwords can't slip
 *   past. Allowing longer values would create a false sense of entropy.
 */

// Maximum bcrypt input length in bytes. bcrypt silently ignores anything past
// this, so we reject it explicitly to avoid surprising truncation semantics.
const BCRYPT_MAX_PASSWORD_LENGTH = 72;

/**
 * Reusable email schema.
 *
 * Order matters: trim and lowercase the raw string FIRST, then validate the
 * email format. Doing it via `.pipe()` means " User@Example.COM " is accepted
 * and normalised to "user@example.com" before format validation runs.
 */
const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Please provide a valid email address" }));

/**
 * Reusable strong-password schema for credential creation (signup / reset).
 *
 * Baseline policy: 8–72 chars, at least one letter and at least one number.
 * Tighten with additional `.regex()` rules (symbols, no-common-passwords) as
 * product requirements firm up.
 */
const strongPasswordSchema = z
  .string({ error: "Password is required" })
  .min(8, { error: "Password must be at least 8 characters long" })
  .regex(/[A-Za-z]/, { error: "Password must contain at least one letter" })
  .regex(/[0-9]/, { error: "Password must contain at least one number" })
  .refine(
    (val) => Buffer.byteLength(val, "utf8") <= BCRYPT_MAX_PASSWORD_LENGTH,
    {
      error: `Password must be at most ${BCRYPT_MAX_PASSWORD_LENGTH} bytes long`,
    }
  );

/**
 * Optional E.164-style mobile number.
 *
 * Accepts an optional leading `+` followed by 8–15 digits (the E.164 range).
 * Kept optional to mirror the User model, where `mobileNumber` is sparse.
 */
const mobileNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, {
    error: "Please provide a valid mobile number in E.164 format",
  })
  .optional();

/**
 * POST /auth/signup — local account creation.
 *
 * `provider` is intentionally absent: this endpoint only mints `local`
 * accounts, and the server sets `provider: "local"`. `role`, `accessScopes`,
 * and `isActive` are likewise server-owned and rejected by `.strict()`.
 */
export const signupSchema = z
  .object({
    name: z
      .string({ error: "Name is required" })
      .trim()
      .min(2, { error: "Name must be at least 2 characters long" })
      .max(100, { error: "Name must be at most 100 characters long" }),
    email: emailSchema,
    password: strongPasswordSchema,
    mobileNumber: mobileNumberSchema,
  })
  .strict();

/**
 * POST /auth/login — local credential exchange.
 *
 * Password is only checked for presence here. We deliberately do NOT apply the
 * strong-password policy on login: rejecting a "too short" password would leak
 * the policy and waste a round-trip; the credential check itself is the gate.
 */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z
      .string({ error: "Password is required" })
      .min(1, { error: "Password is required" }),
  })
  .strict();

/**
 * POST /auth/refresh — exchange a refresh token for a new access token.
 *
 * Validates the inbound token as a non-empty string only; cryptographic
 * verification and DB hash-lookup happen in the service layer (see
 * utils/jwt.ts `verifyRefreshToken` / `hashToken`). If you later move the
 * refresh token to an httpOnly cookie, read it from `req.cookies` in the
 * controller and keep this body schema for the header/body fallback.
 */
export const refreshSchema = z
  .object({
    refreshToken: z
      .string({ error: "Refresh token is required" })
      .min(1, { error: "Refresh token is required" }),
  })
  .strict();

/**
 * Inferred TS types — the single source of truth for handler/service inputs.
 * After `validate(signupSchema)`, `req.body` is exactly `SignupInput`.
 */
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
