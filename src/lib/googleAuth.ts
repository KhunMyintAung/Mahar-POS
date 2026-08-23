/** Signing in with Google.
 *
 *  Uses the authorization-code flow: the browser only ever carries a one-time code, and
 *  the exchange for an identity happens server to server with the client secret. The
 *  identity is then read from Google's userinfo endpoint over that same channel rather
 *  than by parsing a token the browser handed us — nothing a caller controls is trusted.
 *
 *  Signing in matches an existing account by verified email. Where none matches, a new
 *  business is created — the same thing the registration form does, since anyone can
 *  already sign themselves up there. Google never joins someone to a shop that already
 *  exists; that stays an admin's decision.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_STATE_COOKIE = "wn_oauth_state";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Null when the deployment has not been given credentials, which is how the sign-in
 *  button knows to stay hidden rather than offering something that cannot work. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!clientId || !clientSecret || !appUrl) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/+$/, "")}/api/v1/auth/google/callback`,
  };
}

export function googleAuthUrl(config: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    // Google remembers the last account; this makes switching possible on a shared device.
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Trade the one-time code for the signed-in person's details. */
export async function exchangeCodeForIdentity(
  config: GoogleConfig,
  code: string
): Promise<GoogleIdentity> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status})`);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Google returned no access token");

  const userResponse = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) {
    throw new Error(`Google userinfo failed (${userResponse.status})`);
  }
  const profile = (await userResponse.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.email) throw new Error("Google returned no email address");

  return {
    email: profile.email.toLowerCase(),
    // Google sends this as a boolean, but a string has been seen from some tenants.
    emailVerified: profile.email_verified === true || String(profile.email_verified) === "true",
    name: profile.name,
  };
}

/** A username built from the email's local part.
 *
 *  Signing up through Google never asks for one, so it is derived — kept to the characters
 *  a username may contain, and padded when the result would be too short for the rule the
 *  registration form applies. `suffix` distinguishes a name already taken.
 */
export function usernameFromEmail(email: string, suffix = 0): string {
  const local = String(email ?? "").split("@")[0].toLowerCase();
  let base = local.replace(/[^a-z0-9_]/g, "");
  if (base.length === 0) base = "user";
  // The registration rule is 3-40 characters; leave room for the suffix.
  base = base.slice(0, 34);
  while (base.length < 3) base += "0";
  return suffix > 0 ? `${base}${suffix + 1}` : base;
}

/** What to call the business created for someone signing up through Google.
 *
 *  Their own name is the least surprising thing to see, and it is theirs to change in
 *  settings afterwards. Falls back to the email when Google sends no name.
 */
export function businessNameFrom(identity: { email: string; name?: string }): string {
  const named = String(identity.name ?? "").trim();
  if (named.length >= 2) return named.slice(0, 80);
  const local = String(identity.email ?? "").split("@")[0].trim();
  // The registration rule is a minimum of two characters.
  return (local.length >= 2 ? local : `${local}00`).slice(0, 80);
}
