# Testing authentication by hand

How to check every auth flow against a running API: email + password, tokens, logout, and **Sign in with Google** (including getting a real Google ID token from the OAuth 2.0 Playground).

For how auth is designed, see [architecture/authentication.md](../architecture/authentication.md). Exact request and response shapes are in Swagger at `/docs`.

---

## 0. Before you start

**`.env`** must have:

```env
JWT_ACCESS_SECRET=...        # openssl rand -base64 48
JWT_REFRESH_SECRET=...       # different value
PASSWORD_PEPPER=...          # openssl rand -base64 32
GOOGLE_CLIENT_ID=...apps.googleusercontent.com   # only for the Google tests (§3)
GOOGLE_ALLOWED_DOMAINS=howl.in
```

**Start the stack:**

```bash
make dev            # API on http://localhost:4000, Mongo on localhost:27017
```

Check it's up: <http://localhost:4000/health> should return `"status": "ok"`.

You can run every test below in either of two places:

- **Swagger UI** at <http://localhost:4000/docs>. Open an endpoint, click **Try it out**, then **Execute**.
- **curl** in a terminal. The commands below use Git Bash on Windows. In PowerShell, use `curl.exe` instead of `curl`.

```bash
API=http://localhost:4000
```

> After changing `.env`, **restart** the API. Config is read once at startup.

---

## 1. Email + password flow

### 1.1 Sign up → `201`

```bash
curl -s -X POST $API/auth/signup -H "content-type: application/json" \
  -d '{"name":"Test User","email":"test.user@example.com","password":"Passw0rd1"}'
```

Expect `{ user, tokens }`. Check that:

- `user.provider` is `"local"`, `user.role` is `"user"`, `user.hasPassword` is `true` and `user.googleLinked` is `false`
- the response has **no** `password` field
- `tokens.expiresIn` is `900` (15 min)

Copy the tokens into shell variables:

```bash
ACCESS=<paste tokens.accessToken>
REFRESH=<paste tokens.refreshToken>
```

### 1.2 Call a protected route → `200`

```bash
curl -s $API/auth/me -H "Authorization: Bearer $ACCESS"
```

**In Swagger:** click **Authorize** (the padlock at the top), paste the access token **without** the `Bearer ` prefix, then run `GET /auth/me`.

### 1.3 Log in → `200`

```bash
curl -s -X POST $API/auth/login -H "content-type: application/json" \
  -d '{"email":"test.user@example.com","password":"Passw0rd1"}'
```

`user.lastLoginAt` should update.

### 1.4 Refresh: rotation and reuse detection

```bash
# First use → 200, returns a NEW pair
curl -s -X POST $API/auth/refresh -H "content-type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"

# Same old token again → 401 "Refresh token has been revoked"
# (treated as theft: every session for this user is ended)
curl -s -X POST $API/auth/refresh -H "content-type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
```

After the second call, the new refresh token from the first call is **also** dead. Log in again before you continue.

### 1.5 Logout

```bash
# One session → 204 (idempotent: calling it again is still 204)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/auth/logout \
  -H "content-type: application/json" -d "{\"refreshToken\":\"$REFRESH\"}"

# All sessions (needs a valid access token) → 204
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/auth/logout-all \
  -H "Authorization: Bearer $ACCESS"
```

After a single `logout`, that device's access token keeps working until it expires (max 15 min). That's by design. After `logout-all`, access tokens issued before it get `401 Session has been revoked`.

### 1.6 Update profile and password (`PATCH /auth/me`)

Log in again first and set `ACCESS` / `REFRESH`.

```bash
# Profile only → 200 { user }   (no tokens; sessions untouched)
curl -s -X PATCH $API/auth/me -H "Authorization: Bearer $ACCESS" \
  -H "content-type: application/json" \
  -d '{"name":"Test U.","mobileNumber":"+919876543210","profileImage":"https://cdn.example.com/me.png"}'

# Remove fields → 200
curl -s -X PATCH $API/auth/me -H "Authorization: Bearer $ACCESS" \
  -H "content-type: application/json" -d '{"mobileNumber":null,"profileImage":null}'

# Change password → 200 { user, tokens }   (other devices are logged out)
curl -s -X PATCH $API/auth/me -H "Authorization: Bearer $ACCESS" \
  -H "content-type: application/json" \
  -d '{"currentPassword":"Passw0rd1","newPassword":"NewPassw0rd2"}'
```

After a password change, **replace** `ACCESS` / `REFRESH` with the new `tokens` from the response. To check what happened:

- The **old** access token on `/auth/me` returns `401 Session has been revoked`. It must have been issued at least a second earlier.
- The old refresh token returns `401`.
- Login with the old password returns `401`, and login with the new password returns `200`.

**Setting a first password** works for a Google account (`hasPassword: false`): sign in with Google (§3), then send only `{"newPassword":"..."}` with its access token. Afterwards, password login works on the same account.

| Try this                                                           | Expected                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `{}`                                                               | `400 … Provide at least one field to update`                         |
| `{"email":"x@y.com"}` or `{"role":"admin"}`                        | `400 … Unrecognized key`                                             |
| `{"newPassword":"NewPassw0rd2"}` on an account **with** a password | `400 currentPassword is required to change the password`             |
| Wrong `currentPassword` (+ a `name`)                               | `400 Current password is incorrect`, and the name is **not** changed |
| `currentPassword` equal to `newPassword`                           | `400 New password must be different from the current password`       |
| `currentPassword` on a Google account with no password             | `400 No password is set for this account — omit currentPassword`     |
| `{"currentPassword":"x"}` alone                                    | `400 … newPassword is required when currentPassword is provided`     |
| `{"profileImage":"http://x.com/a.png"}`                            | `400 … Profile image must be an https URL`                           |
| No `Authorization` header                                          | `401 Authorization header missing`                                   |

### 1.7 Error cases checklist

| Try this                                                  | Expected                                                |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Sign up again with the same email (any letter case)       | `409 Email is already registered`                       |
| Sign up with `"role":"admin"` in the body                 | `400 … Unrecognized key: "role"`                        |
| Sign up with password `short`                             | `400` listing each failed rule                          |
| Sign up with `user+tag@example.com`                       | `201` (plus-addresses are allowed)                      |
| Log in with a wrong password                              | `401 Invalid email or password`                         |
| Log in with an unknown email                              | **same** `401 Invalid email or password`                |
| `/auth/me` with no header                                 | `401 Authorization header missing`                      |
| `/auth/me` with `Authorization: Basic x`                  | `401 Invalid authorization format. Use: Bearer <token>` |
| `/auth/me` with a token that has one character changed    | `401 Invalid access token: invalid signature`           |
| `/auth/me` with the **refresh** token as the bearer token | `401`                                                   |
| Deactivate the user (§5), then `/auth/me`, login, refresh | `401 Account is deactivated` on all three               |

---

## 2. Google Cloud setup (one time)

You need a Google OAuth **client ID**. To use the OAuth Playground in §3 you also need its **client secret**. See the note in §3 for why.

1. Open <https://console.cloud.google.com/> and select (or create) the project.
2. **APIs & Services → OAuth consent screen** (also labelled **Google Auth Platform → Branding / Audience**):
   - **User type / Audience: Internal.** This only works if the project belongs to the `howl.in` Google Workspace organisation. Google then refuses non-howl.in accounts before they ever reach us.
   - Fill in the app name and support email. Under scopes, `openid`, `email` and `profile` are enough.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Authorized JavaScript origins:** your frontend URLs, e.g. `http://localhost:3000`, plus `http://localhost:5500` for the test page in §4.
   - **Authorized redirect URIs:** `https://developers.google.com/oauthplayground` (**needed only for the Playground**)
4. Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID` and restart the API.
5. Keep the **Client secret** somewhere private. It's used **only** inside the Playground. Never put it in `.env`, the frontend, or git.

---

## 3. Get a Google ID token with the OAuth 2.0 Playground

> **Why your own credentials:** the API only accepts ID tokens whose audience (`aud`) is **our** `GOOGLE_CLIENT_ID`. By default the Playground uses Google's own demo client, so its tokens have the wrong `aud` and the API rejects them with `401 Invalid Google token`. The Playground does the server-side code exchange itself, which is why it asks for the client secret. **Our API still never needs the secret.**

1. Open <https://developers.google.com/oauthplayground>.
2. Click the **gear icon ⚙** (OAuth 2.0 configuration, top right):
   - Tick **Use your own OAuth credentials**.
   - Paste your **OAuth Client ID** and **OAuth Client secret**.
   - Leave **OAuth flow** = Server-side and **Access type** = Online.
   - Close the panel.
3. **Step 1 – Select & authorize APIs.** Ignore the API list. In the **"Input your own scopes"** box at the bottom, enter:

   ```
   openid email profile
   ```

   Click **Authorize APIs**.

4. Sign in with a **@howl.in** Google account and allow access.
   - If you get `redirect_uri_mismatch`, the redirect URI from §2.3 is missing or has a typo.
5. You're back on the Playground at **Step 2 – Exchange authorization code for tokens.** Click **Exchange authorization code for tokens**.
6. The response on the right contains several tokens. Copy the value of **`id_token`**.
   - **Not** `access_token`. That one is opaque and won't work.
7. _(Optional sanity check.)_ Paste the `id_token` into <https://jwt.io> and check:
   - `aud` = your client ID
   - `iss` = `https://accounts.google.com`
   - `email_verified` = `true`
   - `hd` = `howl.in`

   jwt.io decodes in the browser, but don't paste tokens for important accounts into third-party sites if you'd rather not.

8. Send it to the API:

   ```bash
   ID_TOKEN=<paste id_token>
   curl -s -X POST $API/auth/google -H "content-type: application/json" \
     -d "{\"idToken\":\"$ID_TOKEN\"}"
   ```

   Or in Swagger: **Auth → POST /auth/google → Try it out**, then `{ "idToken": "<paste>" }`.

**The ID token expires after 1 hour.** After that, repeat steps 3–6. Playground tokens are for testing only.

---

## 4. Alternative: a local "Sign in with Google" test page (no secret)

This is exactly how the real frontend will work, and it needs only the client ID. Save as `google-test.html` anywhere, **outside the repo**:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google sign-in test</title>
    <script src="https://accounts.google.com/gsi/client" async></script>
  </head>
  <body>
    <div id="btn"></div>
    <pre id="out"></pre>
    <script>
      const CLIENT_ID = "PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com";
      const API = "http://localhost:4000";
      window.onload = () => {
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          hd: "howl.in", // UI hint only; the API enforces the domain
          callback: async ({ credential }) => {
            const res = await fetch(`${API}/auth/google`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ idToken: credential }),
            });
            out.textContent =
              res.status + "\n" + JSON.stringify(await res.json(), null, 2);
          },
        });
        google.accounts.id.renderButton(btn, {
          theme: "outline",
          text: "continue_with",
        });
      };
    </script>
  </body>
</html>
```

Then:

1. Add `http://localhost:5500` to the client's **Authorized JavaScript origins** (§2.3). Changes can take a few minutes to apply.
2. Add `CORS_ORIGINS=http://localhost:5500` to `.env` and restart the API. The page is on a different origin, so the browser needs CORS.
3. Serve the file with `npx serve -l 5500 .` from its folder and open <http://localhost:5500/google-test.html>.
   - Don't open it as `file://`. Google won't load the button there.

---

## 5. Google test scenarios

Use a Playground token (§3) or the test page (§4) for each row.

| #   | Scenario                              | How                                                                                                                                  | Expected                                                                                                                                                                                         |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **New howl.in user (sign-up)**        | First Google sign-in with an account that isn't in the DB                                                                            | **201**. `provider: "google"`, `googleLinked: true`, `hasPassword: false`                                                                                                                        |
| G2  | **Same user again (sign-in)**         | Repeat with a fresh token for the same account                                                                                       | **200**, same `user._id`, `lastLoginAt` updated                                                                                                                                                  |
| G3  | **Tokens work**                       | `GET /auth/me` with G1's `tokens.accessToken`, then `/auth/refresh` with its refresh token                                           | 200 / 200                                                                                                                                                                                        |
| G4  | **Personal Gmail**                    | Sign in with an `@gmail.com` account. On an _Internal_ consent screen Google blocks it first (`org_internal`), which is also a pass. | **403** `Only howl.in Google accounts can sign in`. No user created.                                                                                                                             |
| G5  | **Link an existing password account** | First `POST /auth/signup` with `you@howl.in` and a password, then Google sign-in as `you@howl.in`                                    | **200**, the **same** `_id` as the signup. `googleLinked: true`, `hasPassword: false`. The signup's refresh token now returns `401`, and password login returns `401 Invalid email or password`. |
| G6  | **No duplicate via password signup**  | After G1, `POST /auth/signup` with the same email                                                                                    | **409** `Email is already registered`                                                                                                                                                            |
| G7  | **Expired token**                     | Reuse an ID token that's more than 1 hour old                                                                                        | **401** `Invalid Google token`                                                                                                                                                                   |
| G8  | **Tampered token**                    | Change one character in the middle of the ID token                                                                                   | **401** `Invalid Google token`                                                                                                                                                                   |
| G9  | **Token from another client**         | A Playground token made **without** your own credentials                                                                             | **401** `Invalid Google token`                                                                                                                                                                   |
| G10 | **Deactivated user**                  | Deactivate the user (below), then Google sign-in                                                                                     | **401** `Account is deactivated`                                                                                                                                                                 |
| G11 | **Not configured**                    | Empty `GOOGLE_CLIENT_ID`, restart, then sign in                                                                                      | **503** `Google sign-in is not configured`                                                                                                                                                       |
| G12 | **Empty body**                        | `{}`                                                                                                                                 | **400** `Validation failed - idToken: Google ID token is required`                                                                                                                               |
| G13 | **Password signup still open**        | `POST /auth/signup` with `someone@gmail.com`                                                                                         | **201** (the domain rule is Google-only)                                                                                                                                                         |

`409 This email is linked to a different Google account` shows up only if the stored `googleId` doesn't match. It's hard to trigger by hand: it requires the same email on two different Google accounts. The integration tests cover it.

---

## 6. Inspecting and changing data in Mongo

```bash
docker compose exec mongo mongosh csat
```

```js
// Users (the password hash is a bcrypt string; googleId is set after a Google sign-in)
db.users.find(
  {},
  {
    name: 1,
    email: 1,
    provider: 1,
    googleId: 1,
    role: 1,
    isActive: 1,
    lastLoginAt: 1,
  }
);

// Refresh tokens are stored only as SHA-256 hashes
db.refreshtokens.find({}, { userId: 1, tokenHash: 1, expiresAt: 1 });

// Deactivate / reactivate a user (for the 401 "Account is deactivated" tests)
db.users.updateOne(
  { email: "test.user@example.com" },
  { $set: { isActive: false } }
);
db.users.updateOne(
  { email: "test.user@example.com" },
  { $set: { isActive: true } }
);

// Make someone an admin (there's no API for this yet)
db.users.updateOne({ email: "you@howl.in" }, { $set: { role: "admin" } });

// Start over
db.users.deleteMany({});
db.refreshtokens.deleteMany({});
```

---

## 7. Troubleshooting

| Symptom                                                  | Cause / fix                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401 Invalid Google token` with a fresh Playground token | You didn't tick **Use your own OAuth credentials**, so `aud` is Google's demo client. Or `GOOGLE_CLIENT_ID` in `.env` doesn't match the client used, or the API wasn't restarted. |
| `401 Invalid Google token` after a while                 | ID tokens expire after 1 hour. Get a new one.                                                                                                                                     |
| You sent `access_token` instead of `id_token`            | Always `401`. Use the `id_token` field.                                                                                                                                           |
| `redirect_uri_mismatch` in the Playground                | Add `https://developers.google.com/oauthplayground` exactly (no trailing slash) to **Authorized redirect URIs**.                                                                  |
| `Error 403: org_internal` at Google                      | The consent screen is **Internal** and the account isn't howl.in. Working as intended.                                                                                            |
| `403 Only howl.in Google accounts…` for a howl.in user   | The account has no `hd` claim, so it isn't a Workspace account (for example, a personal Google account registered with a howl.in email). Check the token on jwt.io.               |
| `503 Google sign-in is not configured`                   | `GOOGLE_CLIENT_ID` is empty, or the API wasn't restarted.                                                                                                                         |
| Test page: button doesn't appear / `origin_mismatch`     | Add the page's exact origin to **Authorized JavaScript origins** and wait a few minutes. Serve over `http://localhost`, not `file://`.                                            |
| Test page: browser shows a CORS error                    | Set `CORS_ORIGINS` to the page's origin and restart the API.                                                                                                                      |
| Everything is `401` after a refresh test                 | Reuse detection revoked all sessions. Log in again.                                                                                                                               |

---

## 8. Automated tests

```bash
npm test                    # unit tests: no Mongo, no Google (verifier mocked)
npm run test:integration    # real Mongo; the DB name must contain "test" (csat_test)
```

The integration suites (`tests/integration/api/auth.test.ts`, `google-auth.test.ts`, `profile.test.ts`) cover everything in §1 and §5 automatically, with Google's verification mocked. This manual guide is for proving the **real** Google setup works.
