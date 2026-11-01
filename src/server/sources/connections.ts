import "server-only";
import type { SourceConnection } from "@/domain/types";
import type { CloudSourceId, OAuthTokens } from "../ports/photo-source";
import { col, type Doc } from "../ports/document-store";
import { getDb } from "../container";
import { decrypt, encrypt } from "../crypto";
import { AppError } from "../errors";
import { grantedScopes, needsRefresh, refreshTokens, revokeToken } from "./google-oauth";

/** Domain interfaces have no index signature; intersect with Doc to satisfy the DocumentStore generic. */
type ConnDoc = SourceConnection & Doc;

/** CRUD for SourceConnection documents. Tokens are AES-256-GCM encrypted at rest. */

export const connectionId = (userId: string, sourceId: CloudSourceId) => `${userId}_${sourceId}`;

export async function getConnection(userId: string, sourceId: CloudSourceId): Promise<SourceConnection | null> {
  const db = await getDb();
  return db.get<ConnDoc>(col("connections"), connectionId(userId, sourceId));
}

export async function listConnections(userId: string): Promise<SourceConnection[]> {
  const db = await getDb();
  return db.find<ConnDoc>(col("connections"), { where: [{ field: "userId", op: "eq", value: userId }] });
}

function readTokens(conn: SourceConnection): OAuthTokens {
  try {
    return JSON.parse(decrypt(conn.tokensEnc)) as OAuthTokens;
  } catch {
    // Key rotated / corrupted payload: the owner has to reconnect.
    throw new AppError("conflict", "sourceReconnectRequired");
  }
}

/** Creates or replaces the connection. Keeps an existing refresh token if Google did not send a new one. */
export async function saveConnection(
  userId: string,
  sourceId: CloudSourceId,
  tokens: OAuthTokens,
  accountEmail: string | null,
): Promise<SourceConnection> {
  const db = await getDb();
  const id = connectionId(userId, sourceId);
  const existing = await db.get<ConnDoc>(col("connections"), id);
  let merged = tokens;
  if (!tokens.refreshToken && existing) {
    try {
      merged = { ...tokens, refreshToken: readTokens(existing).refreshToken };
    } catch {
      // existing payload unreadable → keep as is
    }
  }
  const now = new Date().toISOString();
  const doc: ConnDoc = {
    id,
    userId,
    sourceId,
    accountEmail: accountEmail ?? existing?.accountEmail ?? null,
    tokensEnc: encrypt(JSON.stringify(merged)),
    scopes: grantedScopes(merged),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return db.put(col("connections"), doc);
}

const inflight = new Map<string, Promise<OAuthTokens>>();

/**
 * Returns usable tokens, refreshing (and persisting) them when they expire within 60 s.
 * Concurrent callers share one refresh request.
 */
export async function getValidTokens(userId: string, sourceId: CloudSourceId): Promise<OAuthTokens> {
  const id = connectionId(userId, sourceId);
  const db = await getDb();
  const conn = await db.get<ConnDoc>(col("connections"), id);
  if (!conn) throw new AppError("conflict", "sourceNotConnected");
  const tokens = readTokens(conn);
  if (!needsRefresh(tokens)) return tokens;

  let pending = inflight.get(id);
  if (!pending) {
    pending = (async () => {
      const fresh = await refreshTokens(tokens);
      await db.update(col("connections"), id, {
        tokensEnc: encrypt(JSON.stringify(fresh)),
        scopes: grantedScopes(fresh),
        updatedAt: new Date().toISOString(),
      });
      return fresh;
    })().finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
}

/** Revokes the grant at Google (best effort) and deletes the local connection. */
export async function disconnect(userId: string, sourceId: CloudSourceId): Promise<void> {
  const db = await getDb();
  const id = connectionId(userId, sourceId);
  const conn = await db.get<ConnDoc>(col("connections"), id);
  if (!conn) return;
  // With include_granted_scopes all sources of one user share a single Google grant: revoking it
  // would also break the user's other connection, so only revoke when this is the last one.
  const others = (await listConnections(userId)).filter((c) => c.id !== id);
  if (others.length === 0) {
    try {
      const tokens = readTokens(conn);
      await revokeToken(tokens.refreshToken ?? tokens.accessToken);
    } catch {
      // unreadable tokens: nothing to revoke
    }
  }
  await db.delete(col("connections"), id);
}
