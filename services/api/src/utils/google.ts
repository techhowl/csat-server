import { OAuth2Client } from "google-auth-library";
import { config } from "@csat/shared";
import { AppError, ServiceUnavailableError, UnauthorizedError } from "./errors";

/**
 * Google ID-token verification for "Sign in with Google".
 *
 * Kept in its own module so the auth service depends on a tiny, mockable
 * function — tests stub `verifyGoogleIdToken` instead of talking to Google.
 */

/** The verified facts about a Google account that the auth service needs. */
export interface GoogleIdentity {
  /** Google's stable, never-reused account ID (`sub` claim). */
  sub: string;
  /** Verified email, lowercased. */
  email: string;
  name: string;
  picture?: string;
}

// One client per process: it caches Google's signing certificates and
// refreshes them as Google rotates keys.
let client: OAuth2Client | undefined;

/**
 * Verifies a Google ID token and enforces the allowed-domain rule.
 *
 * Checks, in order:
 * 1. Signature against Google's certs, `aud` == GOOGLE_CLIENT_ID, `iss` is
 *    Google, not expired — all inside `verifyIdToken`.
 * 2. `email_verified` is true.
 * 3. The `hd` (hosted domain) claim is an allowed domain. `hd` is only present
 *    for Google Workspace accounts, so personal @gmail.com accounts fail here.
 * 4. The email itself ends in that domain (defence in depth).
 *
 * @throws ServiceUnavailableError 503 if GOOGLE_CLIENT_ID is not configured
 * @throws UnauthorizedError 401 if the token is invalid, expired or for another client
 * @throws AppError 403 if the email is unverified or the domain is not allowed
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleIdentity> {
  const { clientId, allowedDomains } = config.google;
  if (!clientId) {
    throw new ServiceUnavailableError("Google sign-in is not configured");
  }

  client ??= new OAuth2Client({ clientId });

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    // Don't echo the library's reason (it can include token fragments).
    throw new UnauthorizedError("Invalid Google token");
  }
  if (!payload?.sub || !payload.email) {
    throw new UnauthorizedError("Invalid Google token");
  }

  const forbidden = new AppError(
    `Only ${allowedDomains.join(", ")} Google accounts can sign in`,
    403
  );

  if (payload.email_verified !== true) {
    throw forbidden;
  }

  const email = payload.email.toLowerCase();
  const hostedDomain = payload.hd?.toLowerCase();
  const domainAllowed =
    hostedDomain !== undefined &&
    allowedDomains.includes(hostedDomain) &&
    email.endsWith(`@${hostedDomain}`);
  if (!domainAllowed) {
    throw forbidden;
  }

  return {
    sub: payload.sub,
    email,
    name: payload.name?.trim() || email.split("@")[0],
    picture: payload.picture,
  };
}
