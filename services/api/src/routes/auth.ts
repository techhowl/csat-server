import { Router } from "express";
import * as auth from "../controllers/auth";
import { asyncHandler } from "../middlewares/async-handler";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import {
  googleAuthSchema,
  loginSchema,
  refreshSchema,
  signupSchema,
  updateProfileSchema,
} from "../dto/auth.dto";

/**
 * Route layer for authentication. Paths are written in full (`/auth/...`) and
 * the router is mounted at `/`, same as the health router.
 */
export const authRouter = Router();

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     operationId: signup
 *     summary: Create a local account
 *     description: >
 *       Creates a `local` account with role `user` and signs the user in,
 *       returning the user and a token pair.
 *
 *
 *       The body is strict: unknown keys (e.g. `role`, `isActive`,
 *       `accessScopes`, `provider`) are rejected with 400. `email` is trimmed
 *       and lowercased before the uniqueness check.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupRequest'
 *     responses:
 *       201:
 *         description: Account created and signed in.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       409:
 *         $ref: '#/components/responses/EmailConflict'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.post(
  "/auth/signup",
  validate(signupSchema),
  asyncHandler(auth.signup)
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     operationId: login
 *     summary: Sign in with email and password
 *     description: >
 *       Exchanges local credentials for a token pair and updates
 *       `lastLoginAt`.
 *
 *
 *       Unknown email, wrong password and accounts without a local password
 *       (Google sign-in) all return the same 401 `Invalid email or password`,
 *       in the same time, so responses don't reveal which emails are
 *       registered. `Account is deactivated` is only returned after the
 *       password has matched.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Signed in.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Bad credentials or deactivated account.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               badCredentials:
 *                 summary: Unknown email or wrong password
 *                 value:
 *                   error: Invalid email or password
 *               deactivated:
 *                 summary: Correct password, account disabled
 *                 value:
 *                   error: Account is deactivated
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.post("/auth/login", validate(loginSchema), asyncHandler(auth.login));

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     operationId: refreshTokens
 *     summary: Rotate a refresh token
 *     description: >
 *       Exchanges a refresh token for a **new** access token and a **new**
 *       refresh token. Refresh tokens are single-use: the presented token is
 *       consumed, so the client must store the new one.
 *
 *
 *       **Reuse detection:** presenting a refresh token that is validly signed
 *       but already used (or logged out) is treated as theft. Every session
 *       for that user is revoked and the user must log in again.
 *
 *
 *       Exception: a token issued **before** a deliberate revoke-all
 *       (`/auth/logout-all`, or Google being linked to the account) just gets
 *       401 `Refresh token has been revoked`. Sessions created after the
 *       revoke keep working.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: New token pair.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Refresh token invalid, expired, reused, or its user is gone or deactivated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               expired:
 *                 summary: Refresh token expired
 *                 value:
 *                   error: "Invalid refresh token: jwt expired"
 *               badSignature:
 *                 summary: Tampered or foreign token
 *                 value:
 *                   error: "Invalid refresh token: invalid signature"
 *               reused:
 *                 summary: Already used or logged out (all sessions revoked)
 *                 value:
 *                   error: Refresh token has been revoked
 *               userNotFound:
 *                 summary: User deleted
 *                 value:
 *                   error: User not found
 *               deactivated:
 *                 summary: User deactivated (all sessions revoked)
 *                 value:
 *                   error: Account is deactivated
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.post(
  "/auth/refresh",
  validate(refreshSchema),
  asyncHandler(auth.refresh)
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     operationId: logout
 *     summary: End the current session
 *     description: >
 *       Revokes the given refresh token. Idempotent: an unknown, expired or
 *       already-revoked token still returns 204, so the client can always
 *       clear its local state.
 *
 *
 *       The access token is stateless and stays valid until it expires
 *       (at most `JWT_ACCESS_TTL`, default 15 minutes); discard it client-side.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       204:
 *         description: Session ended (or there was nothing to end).
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.post(
  "/auth/logout",
  validate(refreshSchema),
  asyncHandler(auth.logout)
);

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     operationId: logoutAll
 *     summary: End every session (all devices)
 *     description: >
 *       Revokes every refresh token belonging to the authenticated user. No
 *       request body. Outstanding access tokens stay valid until they expire
 *       (at most `JWT_ACCESS_TTL`).
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: All sessions ended.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.post("/auth/logout-all", authenticate, asyncHandler(auth.logoutAll));

/**
 * @openapi
 * /auth/me:
 *   get:
 *     operationId: getCurrentUser
 *     summary: Get the authenticated user
 *     description: >
 *       Returns the user the access token belongs to, freshly loaded from the
 *       database (so role or status changes show up immediately).
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The authenticated user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.get("/auth/me", authenticate, asyncHandler(auth.me));

/**
 * @openapi
 * /auth/me:
 *   patch:
 *     operationId: updateCurrentUser
 *     summary: Update my profile, set or change my password
 *     description: >
 *       Updates the **authenticated user's own** profile. The user is always
 *       the owner of the access token; there is no user ID in the path or body,
 *       so nobody can edit another person's profile. Send only the fields to
 *       change.
 *
 *
 *       **Password:**
 *
 *       - **No password yet** (`hasPassword: false`, e.g. a Google account):
 *       send `newPassword` alone to set one. Password login then works too.
 *
 *       - **Password already set:** send `currentPassword` and `newPassword`.
 *       The current password is verified first; the new one must be
 *       different.
 *
 *
 *       Setting or changing the password **logs out every other device**: their
 *       refresh tokens are deleted and older access tokens are rejected. The
 *       response then includes a fresh `tokens` pair for this device, which the
 *       client must store in place of the old one.
 *
 *
 *       All checks run before anything is saved: if the password part fails,
 *       no other field is changed either.
 *
 *
 *       A wrong `currentPassword` returns **400**, not 401, so clients don't
 *       mistake it for an expired session.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *           examples:
 *             profile:
 *               summary: Update name and mobile number
 *               value: { name: "Priya S.", mobileNumber: "+919876543210" }
 *             removeFields:
 *               summary: Remove mobile number and profile image
 *               value: { mobileNumber: null, profileImage: null }
 *             setPassword:
 *               summary: Set a first password (account has none)
 *               value: { newPassword: "NewPassw0rd" }
 *             changePassword:
 *               summary: Change an existing password
 *               value: { currentPassword: "OldPassw0rd", newPassword: "NewPassw0rd" }
 *     responses:
 *       200:
 *         description: >
 *           Profile updated. `tokens` is included only when the password was
 *           set or changed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdateProfileResponse'
 *       400:
 *         description: Validation failed, or a password rule was broken.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               empty:
 *                 summary: Empty body
 *                 value: { error: "Validation failed - : Provide at least one field to update" }
 *               serverOwned:
 *                 summary: Tried to change a server-owned field
 *                 value: { error: "Validation failed - : Unrecognized key: \"email\"" }
 *               wrongCurrent:
 *                 summary: currentPassword is wrong
 *                 value: { error: "Current password is incorrect" }
 *               missingCurrent:
 *                 summary: Account has a password but currentPassword was not sent
 *                 value: { error: "currentPassword is required to change the password" }
 *               noPasswordYet:
 *                 summary: currentPassword sent for an account without a password
 *                 value: { error: "No password is set for this account — omit currentPassword" }
 *               samePassword:
 *                 summary: newPassword equals the current password
 *                 value: { error: "New password must be different from the current password" }
 *               currentWithoutNew:
 *                 summary: currentPassword without newPassword
 *                 value: { error: "Validation failed - newPassword: newPassword is required when currentPassword is provided" }
 *               weakPassword:
 *                 summary: newPassword fails the policy
 *                 value: { error: "Validation failed - newPassword: Password must contain at least one number" }
 *               badImage:
 *                 summary: profileImage is not an https URL
 *                 value: { error: "Validation failed - profileImage: Profile image must be an https URL" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: The password was changed by another request at the same time.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Password was changed by another request; reload and try again"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
authRouter.patch(
  "/auth/me",
  authenticate,
  validate(updateProfileSchema),
  asyncHandler(auth.updateMe)
);

/**
 * @openapi
 * /auth/google:
 *   post:
 *     operationId: googleAuth
 *     summary: Sign in or sign up with Google (howl.in only)
 *     description: >
 *       Exchanges a Google ID token for a CSAT session. A single endpoint covers
 *       both sign-up and sign-in. Only Google Workspace accounts on an allowed
 *       domain (`GOOGLE_ALLOWED_DOMAINS`, default `howl.in`) are accepted;
 *       normal `POST /auth/signup` is **not** domain-restricted.
 *
 *
 *       **Getting a token:** the frontend renders the Google Identity Services
 *       button with this API's `GOOGLE_CLIENT_ID` and posts the `credential`
 *       it receives as `idToken`.
 *
 *
 *       **How the account is resolved** (one person = one account):
 *
 *       1. A user already linked to this Google account → **sign in (200)**.
 *
 *       2. A password account with the same email → Google is **linked** to it
 *       **(200)**. For security, the account's old password is cleared and
 *       its existing sessions are revoked: password sign-up never proved
 *       ownership of the email, while Google just did. The response shows
 *       `hasPassword: false`.
 *
 *       3. No account → a new `google` account with role `user` is **created
 *       (201)**.
 *
 *
 *       After this, use the returned tokens exactly like those from
 *       `/auth/login`.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleAuthRequest'
 *     responses:
 *       200:
 *         description: Signed in to an existing account (or linked Google to it).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       201:
 *         description: New account created from the Google profile and signed in.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         description: Google token invalid/expired/for another client, or the account is deactivated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidToken:
 *                 summary: Bad signature, expired, or wrong audience
 *                 value:
 *                   error: Invalid Google token
 *               deactivated:
 *                 summary: Account disabled
 *                 value:
 *                   error: Account is deactivated
 *       403:
 *         $ref: '#/components/responses/GoogleDomainForbidden'
 *       409:
 *         description: The email belongs to an account linked to a different Google account.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: This email is linked to a different Google account
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *       503:
 *         $ref: '#/components/responses/GoogleNotConfigured'
 */
authRouter.post(
  "/auth/google",
  validate(googleAuthSchema),
  asyncHandler(auth.googleAuth)
);
