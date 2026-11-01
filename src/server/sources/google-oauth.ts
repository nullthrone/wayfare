import "server-only";
import type { CloudSourceId, OAuthTokens } from "../ports/photo-source";
import { config } from "../config";
import { sealToken, openToken } from "../crypto";
import { AppError, invalid } from "../errors";

/**
 * Google OAuth 2.0 (web server flow) helpers shared by all Google-based photo sources.
 * Plain `fetch`, no SDK. Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Scopes requested on top of the per-source resource scope (to learn the account e-mail). */
export const IDENTITY_SCOPES = ["openid", "email"];

/** Refresh when the access token expires within this window. */
export const REFRESH_SKEW_MS = 60_000;

const STATE_TTL_SECONDS = 600;
const DEFAULT_RETURN_TO = "/account";
const FETCH_TIMEOUT_MS = 15_000;

export interface OAuthState extends Record<string, unknown> {
  userId: string;
  sourceId: CloudSourceId;
  returnTo: string;
}

export function redirectUri(): string {
  return `${config().baseUrl}/api/sources/callback`;
}

export function googleCredentials(): { clientId: string; clientSecret: string } {
  const { clientId, clientSecret } = config().googleSources;
  if (!clientId || !clientSecret) throw invalid("sourceNotConfigured");
  return { clientId, clientSecret };
}

/**
 * Only same-origin relative paths are allowed as redirect targets (open-redirect protection).
 * Anything else falls back to /account.
 */
export function sanitizeReturnTo(value: string | null | undefined, fallback = DEFAULT_RETURN_TO): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "http://wayfare.invalid");
    if (parsed.origin !== "http://wayfare.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/** Appends/overwrites a query parameter on a relative path (keeps hash). */
export function withQueryParam(path: string, key: string, value: string): string {
  const parsed = new URL(path, "http://wayfare.invalid");
  parsed.searchParams.set(key, value);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function createState(input: { userId: string; sourceId: CloudSourceId; returnTo: string }): string {
  return sealToken("oauth-state", { ...input, returnTo: sanitizeReturnTo(input.returnTo) }, STATE_TTL_SECONDS);
}

export function readState(token: string | null | undefined): OAuthState | null {
  if (!token) return null;
  const state = openToken<OAuthState>("oauth-state", token);
  if (!state || typeof state.userId !== "string" || typeof state.sourceId !== "string") return null;
  return { userId: state.userId, sourceId: state.sourceId, returnTo: sanitizeReturnTo(state.returnTo) };
}

export function buildAuthUrl(input: { userId: string; sourceId: CloudSourceId; returnTo: string; scopes: string[]; loginHint?: string | null }): string {
  const { clientId } = googleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: [...input.scopes, ...IDENTITY_SCOPES].join(" "),
    access_type: "offline", // needed to receive a refresh token
    prompt: "consent", // always show consent so Google re-issues the refresh token
    include_granted_scopes: "true", // incremental authorisation (Photos + Drive share one grant)
    state: createState(input),
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse & { ok: boolean }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  let json: TokenResponse = {};
  try {
    json = (await res.json()) as TokenResponse;
  } catch {
    // non-JSON error body
  }
  return { ...json, ok: res.ok };
}

function toTokens(res: TokenResponse, previous?: Pick<OAuthTokens, "refreshToken" | "scope">): OAuthTokens {
  if (!res.access_token) throw new AppError("conflict", "sourceTokenExchangeFailed");
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? previous?.refreshToken ?? null,
    expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000,
    scope: res.scope ?? previous?.scope ?? "",
  };
}

export async function exchangeCode(code: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = googleCredentials();
  const res = await postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  if (!res.ok) throw new AppError("conflict", "sourceTokenExchangeFailed", `Token exchange failed: ${res.error ?? "unknown"}`);
  return toTokens(res);
}

/**
 * Exchanges the refresh token for a new access token. Google does not return a new refresh
 * token here, so the previous one is kept. `invalid_grant` means the user revoked access
 * (or the token expired) → the owner has to reconnect.
 */
export async function refreshTokens(current: OAuthTokens): Promise<OAuthTokens> {
  if (!current.refreshToken) throw new AppError("conflict", "sourceReconnectRequired");
  const { clientId, clientSecret } = googleCredentials();
  const res = await postToken({
    refresh_token: current.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  if (!res.ok) {
    if (res.error === "invalid_grant") throw new AppError("conflict", "sourceReconnectRequired");
    throw new AppError("conflict", "sourceRefreshFailed", `Token refresh failed: ${res.error ?? "unknown"}`);
  }
  return toTokens(res, current);
}

export function needsRefresh(tokens: OAuthTokens, now = Date.now()): boolean {
  return tokens.expiresAt - REFRESH_SKEW_MS <= now;
}

/** Best effort: returns null if the e-mail cannot be determined. */
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

/** Best effort revocation (access or refresh token revokes the whole grant). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    // ignore: the local connection is deleted regardless
  }
}

export function grantedScopes(tokens: Pick<OAuthTokens, "scope">): string[] {
  return tokens.scope.split(/\s+/).filter(Boolean);
}
