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
 *     description: |
 *       Returns the user the access token belongs to, freshly loaded from the
 *       database (so role or status changes show up immediately).
 *
 *       Use it before `PATCH /auth/me` to see which password flow applies:
 *
 *       | Field | Meaning |
 *       |---|---|
 *       | `hasPassword: false` | No password yet (Google account). Set one with `PATCH /auth/me` `{ "newPassword": "…" }` — no old password needed. |
 *       | `hasPassword: true` | Has a password. Change it with `{ "currentPassword": "…", "newPassword": "…" }`. |
 *       | `googleLinked: true` | "Sign in with Google" works for this account. |
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
 *             examples:
 *               googleOnly:
 *                 summary: Signed up with Google — no password yet
 *                 value:
 *                   user:
 *                     _id: 66f0c2a1b4d5e6f708192a3c
 *                     name: Priya Sharma
 *                     email: priya@howl.in
 *                     profileImage: https://lh3.googleusercontent.com/a/priya
 *                     provider: google
 *                     role: user
 *                     accessScopes: []
 *                     isActive: true
 *                     hasPassword: false
 *                     googleLinked: true
 *                     lastLoginAt: "2026-10-05T09:30:00.000Z"
 *                     createdAt: "2026-10-05T09:30:00.000Z"
 *                     updatedAt: "2026-10-05T09:30:00.000Z"
 *               passwordAccount:
 *                 summary: Password account
 *                 value:
 *                   user:
 *                     _id: 66f0c2a1b4d5e6f708192a3d
 *                     name: Ravi Kumar
 *                     email: ravi@example.com
 *                     mobileNumber: "+919876543210"
 *                     profileImage: null
 *                     provider: local
 *                     role: user
 *                     accessScopes: []
 *                     isActive: true
 *                     hasPassword: true
 *                     googleLinked: false
 *                     lastLoginAt: "2026-10-05T09:30:00.000Z"
 *                     createdAt: "2026-10-01T08:00:00.000Z"
 *                     updatedAt: "2026-10-05T09:30:00.000Z"
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
 *     description: |
 *       Updates the **authenticated user's own** profile. The user is always
 *       the owner of the access token — there is no user ID in the path or
 *       body, so nobody can edit another person's profile. Send **only** the
 *       fields you want to change; at least one is required.
 *
 *       ### Which password case am I?
 *
 *       Call `GET /auth/me` and look at `user.hasPassword`:
 *
 *       | `hasPassword` | Typical account | Body to send | Old password? |
 *       |---|---|---|---|
 *       | `false` | Signed up with **Google**, or Google was linked to it | `{ "newPassword": "…" }` | **Not needed** — there isn't one. Sending `currentPassword` is a 400. |
 *       | `true` | Signed up with email + password, or set one earlier | `{ "currentPassword": "…", "newPassword": "…" }` | **Required** and must be correct. |
 *
 *       ### Walkthrough: signed in with Google → set a password
 *
 *       1. `POST /auth/google` (or the frontend's Google button) → copy
 *          `tokens.accessToken` from the response.
 *       2. Click **Authorize** (top of the page), paste the token without the
 *          `Bearer ` prefix.
 *       3. Optional: `GET /auth/me` → confirm `hasPassword` is `false`.
 *       4. `PATCH /auth/me` → **Try it out** → choose the example
 *          **"Set a first password (Google account, no old password)"**:
 *          `{ "newPassword": "MyNewPassw0rd" }` → **Execute**.
 *       5. Response **200** with `user.hasPassword: true` and a **new
 *          `tokens`** pair. Every earlier session (including the token you
 *          just used) is now logged out.
 *       6. Click **Authorize** → **Logout** → paste the **new**
 *          `tokens.accessToken`.
 *       7. You can now sign in either way: `POST /auth/google` **or**
 *          `POST /auth/login` with your email and the new password — it's
 *          the same account.
 *
 *       ### Walkthrough: change an existing password
 *
 *       1. Authorize with a valid access token.
 *       2. `PATCH /auth/me` with
 *          `{ "currentPassword": "OldPassw0rd", "newPassword": "NewPassw0rd" }`.
 *       3. **200** with new `tokens` → re-authorize with them. The old
 *          password no longer works for login.
 *
 *       ### Password rules
 *
 *       - `newPassword`: 8+ characters, at least one letter and one digit,
 *         at most 72 bytes (UTF-8). Must differ from the current password.
 *       - `currentPassword`: only together with `newPassword`.
 *       - A wrong `currentPassword` is **400**, not 401, so clients don't
 *         mistake it for an expired login.
 *
 *       ### What happens after a password set/change
 *
 *       - Every session of the account is logged out: refresh tokens are
 *         deleted and access tokens issued earlier get
 *         `401 Session has been revoked`.
 *       - The response includes a **fresh `tokens` pair for this device** —
 *         the client must replace its stored tokens with it.
 *       - Profile-only updates (no `newPassword`) return just `{ user }` and
 *         don't affect sessions.
 *
 *       ### Profile fields
 *
 *       | Field | Rule | Remove with |
 *       |---|---|---|
 *       | `name` | trimmed, 2–100 characters | — (required on every account) |
 *       | `mobileNumber` | E.164, e.g. `+919876543210` | `null` |
 *       | `profileImage` | **https** URL, ≤ 2048 characters | `null` |
 *
 *       `email`, `role`, `isActive`, `accessScopes`, `provider` and any other
 *       field are **rejected** (400) — they can't be changed here.
 *
 *       ### All or nothing
 *
 *       Every check runs before anything is saved, and all fields are written
 *       in one update. If the password part fails, `name` and the other
 *       fields sent with it are **not** changed either. If two password changes
 *       race, one wins and the other gets **409**.
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
 *             setPassword:
 *               summary: Set a first password (Google account, no old password)
 *               description: >
 *                 For `hasPassword: false`. Send `newPassword` only — do
 *                 **not** send `currentPassword`.
 *               value: { newPassword: "MyNewPassw0rd" }
 *             changePassword:
 *               summary: Change an existing password
 *               description: >
 *                 For `hasPassword: true`. `currentPassword` must be the
 *                 password you log in with today.
 *               value: { currentPassword: "OldPassw0rd", newPassword: "NewPassw0rd" }
 *             profile:
 *               summary: Update name, mobile number and profile image
 *               value:
 *                 name: "Priya S."
 *                 mobileNumber: "+919876543210"
 *                 profileImage: "https://cdn.example.com/avatars/priya.png"
 *             removeFields:
 *               summary: Remove mobile number and profile image
 *               value: { mobileNumber: null, profileImage: null }
 *             profileAndPassword:
 *               summary: Update the name and set a first password together
 *               description: >
 *                 Allowed in one request. If the password part fails, the
 *                 name is not changed either.
 *               value: { name: "Priya S.", newPassword: "MyNewPassw0rd" }
 *     responses:
 *       200:
 *         description: |
 *           Profile updated.
 *
 *           - **Password set or changed** → `{ user, tokens }`. All other
 *             sessions were logged out; store the new `tokens`.
 *           - **Profile fields only** → `{ user }`. Sessions are untouched.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdateProfileResponse'
 *             examples:
 *               passwordSet:
 *                 summary: Password set on a Google account (new tokens)
 *                 value:
 *                   user:
 *                     _id: 66f0c2a1b4d5e6f708192a3c
 *                     name: Priya Sharma
 *                     email: priya@howl.in
 *                     profileImage: https://lh3.googleusercontent.com/a/priya
 *                     provider: google
 *                     role: user
 *                     accessScopes: []
 *                     isActive: true
 *                     hasPassword: true
 *                     googleLinked: true
 *                     lastLoginAt: "2026-10-05T09:30:00.000Z"
 *                     createdAt: "2026-10-05T09:30:00.000Z"
 *                     updatedAt: "2026-10-05T09:42:10.000Z"
 *                   tokens:
 *                     tokenType: Bearer
 *                     accessToken: "<new access token (JWT)>"
 *                     expiresIn: 900
 *                     refreshToken: "<new refresh token (JWT)>"
 *                     refreshTokenExpiresAt: "2026-11-04T09:42:10.000Z"
 *               profileOnly:
 *                 summary: Profile fields only (no tokens)
 *                 value:
 *                   user:
 *                     _id: 66f0c2a1b4d5e6f708192a3d
 *                     name: Priya S.
 *                     email: priya@howl.in
 *                     mobileNumber: "+919876543210"
 *                     profileImage: https://cdn.example.com/avatars/priya.png
 *                     provider: google
 *                     role: user
 *                     accessScopes: []
 *                     isActive: true
 *                     hasPassword: false
 *                     googleLinked: true
 *                     lastLoginAt: "2026-10-05T09:30:00.000Z"
 *                     createdAt: "2026-10-05T09:30:00.000Z"
 *                     updatedAt: "2026-10-05T09:45:00.000Z"
 *       400:
 *         description: |
 *           Validation failed, or a password rule was broken. Nothing was
 *           saved. The most common mistakes:
 *
 *           | Message | Fix |
 *           |---|---|
 *           | `No password is set for this account — omit currentPassword` | Google account: send `newPassword` only. |
 *           | `currentPassword is required to change the password` | The account has a password: also send `currentPassword`. |
 *           | `Current password is incorrect` | Send the password you log in with today. |
 *           | `New password must be different from the current password` | Pick a different `newPassword`. |
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
 *         description: |
 *           Missing, invalid or expired access token, a deactivated account —
 *           or **`Session has been revoked`**: the token was issued before a
 *           password set/change or `logout-all`. Re-authorize with the
 *           `tokens.accessToken` returned by the password change (or log in
 *           again).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingHeader:
 *                 summary: Not authorized in Swagger / no Authorization header
 *                 value: { error: "Authorization header missing" }
 *               sessionRevoked:
 *                 summary: Old token used after a password change
 *                 value: { error: "Session has been revoked" }
 *               expired:
 *                 summary: Access token expired
 *                 value: { error: "Invalid access token: jwt expired" }
 *               deactivated:
 *                 summary: Account deactivated
 *                 value: { error: "Account is deactivated" }
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
