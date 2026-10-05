/**
 * Reusable OpenAPI `components` for the `api` service: security schemes,
 * schemas and responses that `@openapi` route annotations `$ref`.
 *
 * Every schema here mirrors a source of truth in code — the comment above each
 * one names it. The request schemas are hand-written (Zod's JSON Schema output
 * drops formats, descriptions and examples), so tests/unit/api/docs.test.ts
 * asserts they stay a superset of `z.toJSONSchema()` of the matching DTO. If you
 * change a DTO, that test tells you to update the schema here.
 */

// Shared error body examples — the exact messages thrown in the codebase.
const AUTH_ERROR_EXAMPLES = {
  missingHeader: {
    summary: "No Authorization header",
    value: { error: "Authorization header missing" },
  },
  badFormat: {
    summary: "Header is not `Bearer <token>`",
    value: { error: "Invalid authorization format. Use: Bearer <token>" },
  },
  expired: {
    summary: "Access token expired",
    value: { error: "Invalid access token: jwt expired" },
  },
  badSignature: {
    summary: "Tampered token or wrong secret",
    value: { error: "Invalid access token: invalid signature" },
  },
  userNotFound: {
    summary: "Token valid but user was deleted",
    value: { error: "User not found" },
  },
  deactivated: {
    summary: "Token valid but user.isActive is false",
    value: { error: "Account is deactivated" },
  },
  sessionRevoked: {
    summary:
      "Token issued before logout-all / a password change / Google linking",
    value: { error: "Session has been revoked" },
  },
};

export const components = {
  // JWT access token sent as `Authorization: Bearer <token>` — the contract
  // enforced by middlewares/authenticate.ts. Defining it here enables the
  // Swagger UI "Authorize" button. There is no global `security` block on
  // purpose: /health is public, so protected routes opt in per operation with
  // `security: [{ bearerAuth: [] }]` in their `@openapi` annotation.
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: [
        "Short-lived JWT **access token** (default lifetime `15m`, `JWT_ACCESS_TTL`).",
        "",
        "- Signed HS256 with `JWT_ACCESS_SECRET`, issuer `csat-api`.",
        "- Payload is exactly `{ userId, iat, exp, iss }` — no PII.",
        "- On every request the user is re-loaded from MongoDB, so a deleted or",
        "  deactivated user is rejected immediately even with an unexpired token.",
        "",
        "In Swagger UI, click **Authorize** and paste the raw token (without the",
        "`Bearer ` prefix).",
      ].join("\n"),
    },
  },

  schemas: {
    // Mirrors HealthReport in services/api/src/services/health.ts.
    HealthReport: {
      type: "object",
      description:
        "Point-in-time liveness + readiness snapshot of the api process.",
      properties: {
        status: {
          type: "string",
          enum: ["ok", "degraded"],
          description:
            "`ok` only when every hard dependency is `up`; otherwise `degraded`.",
        },
        service: {
          type: "string",
          description: "Name of the reporting service.",
          example: "api",
        },
        uptimeSec: {
          type: "integer",
          minimum: 0,
          description: "Process uptime in whole seconds (`process.uptime()`).",
          example: 42,
        },
        dependencies: {
          type: "object",
          description: "Reachability of each hard dependency.",
          properties: {
            mongo: {
              type: "string",
              enum: ["up", "down"],
              description: "MongoDB connection state (Mongoose `readyState`).",
            },
          },
          required: ["mongo"],
          additionalProperties: false,
        },
        timestamp: {
          type: "string",
          format: "date-time",
          description: "When the snapshot was taken (ISO 8601, UTC).",
          example: "2026-10-05T07:12:45.123Z",
        },
      },
      required: ["status", "service", "uptimeSec", "dependencies", "timestamp"],
      additionalProperties: false,
    },

    // Body shape from middlewares/not-found.ts and middlewares/error-handler.ts.
    ErrorResponse: {
      type: "object",
      description: [
        "Every error response uses this body. `error` is the human-readable",
        "message for 4xx errors; 5xx errors always say `Internal Server Error`",
        "so internals never leak.",
        "",
        "The other fields appear **only when `NODE_ENV=development`**.",
      ].join("\n"),
      properties: {
        error: { type: "string", example: "Not Found" },
        stack: {
          type: "string",
          description: "Development only — stack trace.",
        },
        message: {
          type: "string",
          description:
            "Development only — original message of an unexpected (non-AppError) error.",
        },
        details: {
          type: "array",
          description: "Development only — raw Zod issues for a ZodError.",
          items: { type: "object" },
        },
      },
      required: ["error"],
    },

    // Mirrors the AccessScopeSchema sub-document in models/user.ts.
    AccessScope: {
      type: "object",
      description:
        "Grants a user access to one SBU or department. Stored, but not yet checked by any route.",
      properties: {
        resourceType: { type: "string", enum: ["sbu", "department"] },
        resourceId: {
          type: "string",
          pattern: "^[0-9a-fA-F]{24}$",
          description: "MongoDB ObjectId of the SBU or department.",
          example: "66f0c2a1b4d5e6f708192a3b",
        },
      },
      required: ["resourceType", "resourceId"],
      additionalProperties: false,
    },

    // Mirrors IUser in models/user.ts after its toJSON transform (password and
    // __v stripped). This is also the shape of `req.user` after authenticate.
    User: {
      type: "object",
      description:
        "Public user representation. `password` and `__v` are never serialised.",
      properties: {
        _id: {
          type: "string",
          pattern: "^[0-9a-fA-F]{24}$",
          example: "66f0c2a1b4d5e6f708192a3c",
        },
        name: { type: "string", example: "Priya Sharma" },
        email: {
          type: "string",
          format: "email",
          description: "Unique, stored lowercase.",
          example: "priya@example.com",
        },
        mobileNumber: {
          type: "string",
          description: "E.164 format.",
          example: "+919876543210",
        },
        profileImage: {
          type: "string",
          nullable: true,
          description: "URL of the profile image.",
          example: null,
        },
        provider: {
          type: "string",
          enum: ["local", "google"],
          description:
            "How the account was **created**: `local` via `POST /auth/signup`, `google` via `POST /auth/google`. It does not change when Google is linked later; use `hasPassword` / `googleLinked` to see which sign-in methods work now.",
        },
        role: {
          type: "string",
          enum: ["admin", "user"],
          description:
            "Checked by the `requireRole` middleware. Server-owned — never accepted from clients.",
        },
        accessScopes: {
          type: "array",
          items: { $ref: "#/components/schemas/AccessScope" },
        },
        isActive: {
          type: "boolean",
          description: "`false` blocks all authenticated requests (401).",
        },
        hasPassword: {
          type: "boolean",
          description:
            "Whether email + password login works. `false` for Google-created accounts and for password accounts whose password was cleared when Google was linked.",
        },
        googleLinked: {
          type: "boolean",
          description:
            "Whether `POST /auth/google` can sign in to this account.",
        },
        lastLoginAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: [
        "_id",
        "name",
        "email",
        "provider",
        "role",
        "accessScopes",
        "isActive",
        "hasPassword",
        "googleLinked",
        "createdAt",
        "updatedAt",
      ],
    },

    // Mirrors signupSchema in dto/auth.dto.ts.
    SignupRequest: {
      type: "object",
      description: [
        "Request body for `POST /auth/signup` (local account creation).",
        "",
        "Unknown keys are **rejected** (400), so `role`, `accessScopes`,",
        "`isActive` and `provider` cannot be smuggled in.",
      ].join("\n"),
      properties: {
        name: {
          type: "string",
          minLength: 2,
          maxLength: 100,
          description: "Trimmed before validation.",
          example: "Priya Sharma",
        },
        email: {
          type: "string",
          format: "email",
          description: "Trimmed and lowercased before validation.",
          example: "priya@example.com",
        },
        password: {
          type: "string",
          format: "password",
          minLength: 8,
          allOf: [
            { type: "string", pattern: "[A-Za-z]" },
            { type: "string", pattern: "[0-9]" },
          ],
          description:
            "8+ characters, at least one letter and one digit, at most **72 bytes** UTF-8 (bcrypt limit).",
          example: "Sup3rSecret",
        },
        mobileNumber: {
          type: "string",
          pattern: "^\\+?[1-9]\\d{7,14}$",
          description: "Optional. E.164 format, trimmed.",
          example: "+919876543210",
        },
      },
      required: ["name", "email", "password"],
      additionalProperties: false,
    },

    // Mirrors loginSchema in dto/auth.dto.ts.
    LoginRequest: {
      type: "object",
      description: [
        "Request body for `POST /auth/login` (local credential exchange).",
        "",
        "Password is only checked for presence — the strength policy is not",
        "applied on login so the policy isn't leaked.",
      ].join("\n"),
      properties: {
        email: {
          type: "string",
          format: "email",
          description: "Trimmed and lowercased before validation.",
          example: "priya@example.com",
        },
        password: {
          type: "string",
          format: "password",
          minLength: 1,
          example: "Sup3rSecret",
        },
      },
      required: ["email", "password"],
      additionalProperties: false,
    },

    // Mirrors googleAuthSchema in dto/auth.dto.ts.
    GoogleAuthRequest: {
      type: "object",
      description:
        "Request body for `POST /auth/google`. Signature, audience, expiry and the allowed-domain rule are verified server-side.",
      properties: {
        idToken: {
          type: "string",
          minLength: 1,
          description:
            "Google ID token (a JWT) — the `credential` returned by the Google Identity Services sign-in button.",
          example: "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
        },
      },
      required: ["idToken"],
      additionalProperties: false,
    },

    // Mirrors refreshSchema in dto/auth.dto.ts.
    RefreshRequest: {
      type: "object",
      description:
        "Request body for `POST /auth/refresh` and `POST /auth/logout`. Signature and DB-hash checks happen server-side.",
      properties: {
        refreshToken: {
          type: "string",
          minLength: 1,
          description:
            "JWT refresh token (default lifetime `30d`). Stored server-side only as a SHA-256 hash.",
        },
      },
      required: ["refreshToken"],
      additionalProperties: false,
    },

    // Mirrors AuthTokens in services/auth.ts.
    AuthTokens: {
      type: "object",
      description: [
        "A fresh token pair. Store **both**: refresh tokens are single-use, so",
        "the old one stops working as soon as it has been used.",
      ].join("\n"),
      properties: {
        tokenType: {
          type: "string",
          enum: ["Bearer"],
          description:
            "Send the access token as `Authorization: Bearer <accessToken>`.",
        },
        accessToken: {
          type: "string",
          description: "JWT access token for the `bearerAuth` scheme.",
          example:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NmYwYzJhMWI0ZDVlNmY3MDgxOTJhM2MifQ.sig",
        },
        expiresIn: {
          type: "integer",
          minimum: 0,
          description:
            "Seconds until the access token expires (default `JWT_ACCESS_TTL` = 15m → 900).",
          example: 900,
        },
        refreshToken: {
          type: "string",
          description:
            "JWT refresh token. Use it once with `POST /auth/refresh`.",
        },
        refreshTokenExpiresAt: {
          type: "string",
          format: "date-time",
          description:
            "When the refresh token expires (default `JWT_REFRESH_TTL` = 30d).",
          example: "2026-11-04T07:12:45.000Z",
        },
      },
      required: [
        "tokenType",
        "accessToken",
        "expiresIn",
        "refreshToken",
        "refreshTokenExpiresAt",
      ],
      additionalProperties: false,
    },

    // Body of POST /auth/signup and POST /auth/login (AuthResult in services/auth.ts).
    AuthResponse: {
      type: "object",
      properties: {
        user: { $ref: "#/components/schemas/User" },
        tokens: { $ref: "#/components/schemas/AuthTokens" },
      },
      required: ["user", "tokens"],
      additionalProperties: false,
    },

    // Body of POST /auth/refresh (controllers/auth.ts).
    RefreshResponse: {
      type: "object",
      properties: {
        tokens: { $ref: "#/components/schemas/AuthTokens" },
      },
      required: ["tokens"],
      additionalProperties: false,
    },

    // Body of GET /auth/me (controllers/auth.ts).
    MeResponse: {
      type: "object",
      properties: {
        user: { $ref: "#/components/schemas/User" },
      },
      required: ["user"],
      additionalProperties: false,
    },

    // Mirrors updateProfileSchema in dto/auth.dto.ts.
    UpdateProfileRequest: {
      type: "object",
      description: [
        "Body of `PATCH /auth/me`. Send only the fields to change; at least one",
        "is required. Unknown keys (`email`, `role`, …) are **rejected** (400).",
        "",
        "**Password:**",
        "- Account has **no password** (`hasPassword: false`, e.g. Google-only):",
        "  send `newPassword` alone to set one.",
        "- Account **has a password**: send `currentPassword` + `newPassword`.",
        "  The current password must be correct, and the new one must differ.",
      ].join("\n"),
      properties: {
        name: {
          type: "string",
          minLength: 2,
          maxLength: 100,
          description: "Trimmed before validation.",
          example: "Priya Sharma",
        },
        mobileNumber: {
          type: "string",
          nullable: true,
          pattern: "^\\+?[1-9]\\d{7,14}$",
          description: "E.164 format, trimmed. `null` removes it.",
          example: "+919876543210",
        },
        profileImage: {
          type: "string",
          nullable: true,
          format: "uri",
          maxLength: 2048,
          description: "**https** URL only. `null` removes it.",
          example: "https://cdn.example.com/avatars/priya.png",
        },
        currentPassword: {
          type: "string",
          format: "password",
          minLength: 1,
          description:
            "Required when the account already has a password; must be omitted when it doesn't. Never sent without `newPassword`.",
          example: "OldPassw0rd",
        },
        newPassword: {
          type: "string",
          format: "password",
          minLength: 8,
          allOf: [
            { type: "string", pattern: "[A-Za-z]" },
            { type: "string", pattern: "[0-9]" },
          ],
          description:
            "8+ characters, at least one letter and one digit, at most **72 bytes** UTF-8. Setting or changing it **logs out every other device**.",
          example: "NewPassw0rd",
        },
      },
      additionalProperties: false,
    },

    // Body of PATCH /auth/me (UpdateProfileResult in services/auth.ts).
    UpdateProfileResponse: {
      type: "object",
      description:
        "`tokens` is present **only** when the password was set or changed. All earlier sessions were revoked, so the client must replace its stored tokens with these.",
      properties: {
        user: { $ref: "#/components/schemas/User" },
        tokens: { $ref: "#/components/schemas/AuthTokens" },
      },
      required: ["user"],
      additionalProperties: false,
    },
  },

  responses: {
    // AppError(…, 403) thrown by utils/google.ts verifyGoogleIdToken.
    GoogleDomainForbidden: {
      description:
        "The Google account is not on an allowed Workspace domain (`GOOGLE_ALLOWED_DOMAINS`, default `howl.in`), or its email is not verified. Personal @gmail.com accounts always land here.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: "Only howl.in Google accounts can sign in" },
        },
      },
    },

    // AppError(…, 503) thrown by utils/google.ts when GOOGLE_CLIENT_ID is empty.
    GoogleNotConfigured: {
      description:
        "Google sign-in is disabled on this server because `GOOGLE_CLIENT_ID` is not set.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: "Google sign-in is not configured" },
        },
      },
    },

    // ConflictError thrown by services/auth.ts signup.
    EmailConflict: {
      description: "An account with this email already exists.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: "Email is already registered" },
        },
      },
    },

    // ValidationError from middlewares/validate.ts / error-handler.ts.
    BadRequest: {
      description:
        "Request failed validation. The message lists every failing field as `path: message`.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          examples: {
            validation: {
              summary: "Body validation failure",
              value: {
                error:
                  "Validation failed - name: Name must be at least 2 characters long, email: Please provide a valid email address, password: Password must be at least 8 characters long, password: Password must contain at least one number",
              },
            },
            unknownKey: {
              summary: "Unknown key rejected by .strict()",
              value: {
                error: 'Validation failed - : Unrecognized key: "role"',
              },
            },
          },
        },
      },
    },

    // UnauthorizedError thrown by middlewares/authenticate.ts and utils/jwt.ts.
    Unauthorized: {
      description:
        "Missing, malformed, expired or invalid access token — or the token's user no longer exists or is deactivated.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          examples: AUTH_ERROR_EXAMPLES,
        },
      },
    },

    // AppError(…, 403) thrown by requireRole in middlewares/authenticate.ts.
    Forbidden: {
      description:
        "Authenticated, but the user's `role` is not allowed for this operation.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: "Insufficient permissions" },
        },
      },
    },

    // middlewares/not-found.ts — returned for any unmatched route.
    NotFound: {
      description: "No route matches the request method and path.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: "Not Found" },
        },
      },
    },

    // Generic 5xx body from middlewares/error-handler.ts.
    InternalServerError: {
      description:
        "Unexpected server fault. The message is always generic in production.",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ErrorResponse" },
          example: { error: "Internal Server Error" },
        },
      },
    },
  },
};
