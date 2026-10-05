import type { Document } from "mongoose";
import { createLogger } from "@csat/shared";
import { RefreshToken, User, type IUser } from "../models";
import type { LoginInput, SignupInput } from "../dto/auth.dto";
import { comparePassword, hashPassword } from "../utils/password";
import {
  getTokenExpiry,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { ConflictError, UnauthorizedError } from "../utils/errors";

/**
 * Service layer for authentication — business logic only, no req/res.
 *
 * Token model: a short-lived JWT access token (stateless) plus a long-lived
 * JWT refresh token that is ALSO tracked server-side as a SHA-256 hash in the
 * RefreshToken collection. Refresh tokens are single-use: every refresh
 * deletes the presented token and issues a new pair (rotation). Presenting a
 * token that verifies but is no longer stored means it was already used —
 * likely stolen — so every session for that user is revoked.
 */

const log = createLogger("api");

// One message for "no such user", "wrong password" and "no local password"
// (Google accounts), so login responses never reveal which accounts exist.
const INVALID_CREDENTIALS = "Invalid email or password";

/** Public user shape — mirrors the `User` schema in docs/components.ts. */
export interface PublicUser {
  _id: string;
  name: string;
  email: string;
  mobileNumber?: string;
  profileImage: string | null;
  provider: IUser["provider"];
  role: IUser["role"];
  accessScopes: Array<{
    resourceType: "sbu" | "department";
    resourceId: string;
  }>;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Token bundle returned by signup, login and refresh. */
export interface AuthTokens {
  tokenType: "Bearer";
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

// Accepts both a hydrated document and the lean object `authenticate` puts on
// req.user — only data properties are read.
type UserLike = Omit<IUser, keyof Document> & { _id: unknown };

/**
 * Explicit allowlist serializer. Never `res.json(user)` directly: picking
 * fields here guarantees the password hash and internal keys (`__v`) can't
 * leak, whichever way the user was loaded.
 */
export function toPublicUser(user: UserLike): PublicUser {
  const iso = (d?: Date | null): string | null =>
    d ? new Date(d).toISOString() : null;
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    ...(user.mobileNumber ? { mobileNumber: user.mobileNumber } : {}),
    profileImage: user.profileImage ?? null,
    provider: user.provider,
    role: user.role,
    accessScopes: (user.accessScopes ?? []).map((s) => ({
      resourceType: s.resourceType,
      resourceId: String(s.resourceId),
    })),
    isActive: user.isActive,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: iso(user.createdAt) as string,
    updatedAt: iso(user.updatedAt) as string,
  };
}

/**
 * Signs a new access/refresh pair and persists the refresh token's hash. The
 * stored `expiresAt` is the JWT's own `exp`, so the TTL index removes the row
 * exactly when the token stops verifying.
 */
async function issueTokens(userId: string): Promise<AuthTokens> {
  const accessToken = signAccessToken({ userId });
  const refreshToken = signRefreshToken({ userId });
  const refreshTokenExpiresAt = getTokenExpiry(refreshToken);

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  const accessExpiresMs = getTokenExpiry(accessToken).getTime() - Date.now();
  return {
    tokenType: "Bearer",
    accessToken,
    expiresIn: Math.max(0, Math.round(accessExpiresMs / 1000)),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
  };
}

// A real bcrypt hash compared against when the email is unknown, so a failed
// login costs the same time whether or not the account exists (no timing
// oracle for account enumeration). Computed lazily, once per process.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password-1");
  return dummyHash;
}

// MongoDB duplicate-key error (E11000) — raised when two signups for the same
// email race past the existence check.
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === 11000
  );
}

/**
 * Creates a local account and signs the user in.
 *
 * @throws ConflictError (409) if the email is already registered
 */
export async function signup(input: SignupInput): Promise<AuthResult> {
  if (await User.exists({ email: input.email })) {
    throw new ConflictError("Email is already registered");
  }

  const password = await hashPassword(input.password);

  let user;
  try {
    // Server-owned fields are set here explicitly; the DTO's .strict() already
    // rejected any attempt to send role/provider/isActive/accessScopes.
    user = await User.create({
      name: input.name,
      email: input.email,
      mobileNumber: input.mobileNumber,
      password,
      provider: "local",
      lastLoginAt: new Date(),
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ConflictError("Email is already registered");
    }
    throw err;
  }

  const tokens = await issueTokens(String(user._id));
  return { user: toPublicUser(user), tokens };
}

/**
 * Exchanges email + password for a token pair.
 *
 * @throws UnauthorizedError (401) on bad credentials or a deactivated account
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email })
    .select("+password")
    .exec();

  if (!user || !user.password) {
    await comparePassword(input.password, await getDummyHash());
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  if (!(await comparePassword(input.password, user.password))) {
    throw new UnauthorizedError(INVALID_CREDENTIALS);
  }

  // Checked only after the password matches, so it reveals nothing to someone
  // who doesn't already hold the credentials.
  if (!user.isActive) {
    throw new UnauthorizedError("Account is deactivated");
  }

  // updateOne rather than user.save(): no full-document re-validation, and the
  // password field we selected is never written back.
  const lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt } }).exec();
  user.lastLoginAt = lastLoginAt;

  const tokens = await issueTokens(String(user._id));
  return { user: toPublicUser(user), tokens };
}

/**
 * Rotates a refresh token: the presented token is consumed and a new pair is
 * issued.
 *
 * @throws UnauthorizedError (401) if the token is invalid, expired, already
 *   used/revoked, or its user is gone or deactivated
 */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const { userId } = verifyRefreshToken(refreshToken);

  // Atomic consume: of two concurrent refreshes with the same token, exactly
  // one gets the row.
  const stored = await RefreshToken.findOneAndDelete({
    tokenHash: hashToken(refreshToken),
  }).exec();

  if (!stored) {
    // Signature is valid but the token is no longer stored: it was already
    // rotated or logged out. Treat as theft and end every session.
    await RefreshToken.deleteMany({ userId }).exec();
    log.warn("Refresh token reuse detected; revoked all sessions", { userId });
    throw new UnauthorizedError("Refresh token has been revoked");
  }

  if (String(stored.userId) !== userId) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  const user = await User.findById(userId).select("isActive").lean().exec();
  if (!user) {
    throw new UnauthorizedError("User not found");
  }
  if (!user.isActive) {
    await RefreshToken.deleteMany({ userId }).exec();
    throw new UnauthorizedError("Account is deactivated");
  }

  return issueTokens(userId);
}

/**
 * Ends one session by deleting its refresh token. Idempotent: an unknown or
 * already-deleted token is a no-op, so clients can always clear local state.
 * The access token stays valid until it expires (max JWT_ACCESS_TTL).
 */
export async function logout(refreshToken: string): Promise<void> {
  await RefreshToken.deleteOne({ tokenHash: hashToken(refreshToken) }).exec();
}

/**
 * Ends every session for a user ("log out of all devices").
 *
 * @returns How many refresh tokens were revoked
 */
export async function logoutAll(userId: string): Promise<number> {
  const { deletedCount } = await RefreshToken.deleteMany({ userId }).exec();
  return deletedCount;
}
