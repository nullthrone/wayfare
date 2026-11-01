import "server-only";
import { z } from "zod";
import type { Photo, SessionUser, SourceConnection } from "@/domain/types";
import type { CloudSourceId, PhotoSourceAdapter, RemoteItem, SelectionStart } from "../ports/photo-source";
import { col, type Doc } from "../ports/document-store";
import { getDb } from "../container";
import { AppError, forbidden, invalid } from "../errors";
import { addPhoto } from "../services/photos";
import { getAlbumForOwner } from "../services/albums";
import { disconnect, getValidTokens, listConnections, saveConnection } from "./connections";
import { buildAuthUrl, exchangeCode, fetchAccountEmail, grantedScopes, readState, sanitizeReturnTo } from "./google-oauth";
import { UnsupportedItemError } from "./http";
import { getSource, isCloudSourceId, listAdapters } from "./registry";

/**
 * Photo source orchestration (Google Photos, Google Drive). See ports/photo-source.ts.
 *
 * Routes:
 *   GET  /api/sources                      → SourceInfo[]
 *   GET  /api/sources/{sourceId}/connect   → redirects to Google OAuth (state = signed {userId, sourceId, returnTo})
 *   GET  /api/sources/callback             → exchanges code, stores encrypted tokens, redirects back (?source=connected|error)
 *   POST /api/sources/{sourceId}/disconnect
 *   POST /api/sources/{sourceId}/selection → SelectionStart
 *   GET  /api/sources/{sourceId}/selection/{sessionId} → { done }
 *   POST /api/albums/{albumId}/import      → body { sourceId, sessionId?, refs?, offset? } imports a batch
 *                                            of max 10 items per call; returns { imported, skipped, failed, nextOffset|null, total }
 */

export interface SourceInfo {
  id: CloudSourceId;
  labelKey: string;
  configured: boolean;
  connection: Pick<SourceConnection, "accountEmail" | "createdAt"> | null;
}

/** Max items processed per importBatch call (keeps a request well below typical timeouts). */
export const IMPORT_BATCH_SIZE = 10;
const MAX_REFS = 1000;

export interface ImportFailure {
  ref: string;
  filename?: string;
  /** i18n key (sources.errors.<key>) */
  error: string;
}

export interface ImportBatchResult {
  imported: number;
  /** Duplicates (already imported), videos and non-image files. */
  skipped: number;
  failed: ImportFailure[];
  nextOffset: number | null;
  total: number;
}

function requireOwner(actor: SessionUser): void {
  if (actor.banned || (actor.role !== "owner" && actor.role !== "admin")) throw forbidden();
}

function configuredAdapter(sourceId: string): PhotoSourceAdapter {
  const adapter = getSource(sourceId);
  if (!adapter.isConfigured()) throw invalid("sourceNotConfigured");
  return adapter;
}

export async function listSources(actor: SessionUser): Promise<SourceInfo[]> {
  const connections = await listConnections(actor.id);
  return listAdapters().map((a) => {
    const c = connections.find((x) => x.sourceId === a.id);
    return {
      id: a.id,
      labelKey: a.labelKey,
      configured: a.isConfigured(),
      connection: c ? { accountEmail: c.accountEmail, createdAt: c.createdAt } : null,
    };
  });
}

/** Builds the Google consent URL for the connect route. */
export function beginConnect(actor: SessionUser, sourceId: string, returnTo: string | null | undefined): string {
  requireOwner(actor);
  const adapter = configuredAdapter(sourceId);
  return buildAuthUrl({
    userId: actor.id,
    sourceId: adapter.id,
    returnTo: sanitizeReturnTo(returnTo),
    scopes: adapter.scopes,
  });
}

/**
 * OAuth callback. Never throws for user-level problems: returns where to redirect and whether
 * the connection was stored.
 */
export async function completeConnect(
  actor: SessionUser | null,
  params: { code?: string | null; state?: string | null; error?: string | null },
): Promise<{ ok: boolean; returnTo: string }> {
  const state = readState(params.state);
  const returnTo = state?.returnTo ?? sanitizeReturnTo(null);
  if (!state || !actor || state.userId !== actor.id || !isCloudSourceId(state.sourceId)) return { ok: false, returnTo };
  if (params.error || !params.code) return { ok: false, returnTo };
  try {
    requireOwner(actor);
    const adapter = configuredAdapter(state.sourceId);
    const tokens = await exchangeCode(params.code);
    // Granular consent: the user may have unticked the resource scope.
    const granted = grantedScopes(tokens);
    if (!adapter.scopes.every((s) => granted.includes(s))) return { ok: false, returnTo };
    const email = await fetchAccountEmail(tokens.accessToken);
    await saveConnection(actor.id, adapter.id, tokens, email);
    return { ok: true, returnTo };
  } catch (e) {
    console.error("[sources] connect failed:", e instanceof Error ? e.message : e);
    return { ok: false, returnTo };
  }
}

export async function disconnectSource(actor: SessionUser, sourceId: string): Promise<void> {
  const adapter = getSource(sourceId);
  await disconnect(actor.id, adapter.id);
}

export async function startSelection(actor: SessionUser, sourceId: CloudSourceId): Promise<SelectionStart> {
  requireOwner(actor);
  const adapter = configuredAdapter(sourceId);
  const tokens = await getValidTokens(actor.id, adapter.id);
  return adapter.startSelection(tokens);
}

export async function pollSelection(actor: SessionUser, sourceId: CloudSourceId, sessionId: string): Promise<{ done: boolean }> {
  requireOwner(actor);
  const adapter = configuredAdapter(sourceId);
  if (!adapter.pollSelection) throw invalid("sourceNoPolling");
  const tokens = await getValidTokens(actor.id, adapter.id);
  return adapter.pollSelection(tokens, sessionId);
}

// --- import ---------------------------------------------------------------------------------

const importInput = z.object({
  sourceId: z.string().min(1).max(40),
  sessionId: z.string().min(1).max(300).optional(),
  refs: z.array(z.string().min(1).max(300)).max(MAX_REFS).optional(),
  offset: z.number().int().min(0).default(0),
});
export type ImportBatchInput = z.input<typeof importInput>;

/** Short-lived cache of a picker session's item list so that each batch does not re-list everything. */
const LIST_TTL_MS = 5 * 60_000;
const listCache = new Map<string, { at: number; items: RemoteItem[] }>();

export function clearSelectionCache(): void {
  listCache.clear();
}

async function listSessionItems(
  adapter: PhotoSourceAdapter,
  tokens: Awaited<ReturnType<typeof getValidTokens>>,
  userId: string,
  sessionId: string,
): Promise<RemoteItem[]> {
  const key = `${userId}:${adapter.id}:${sessionId}`;
  const now = Date.now();
  for (const [k, v] of listCache) if (now - v.at > LIST_TTL_MS) listCache.delete(k);
  const hit = listCache.get(key);
  if (hit) return hit.items;
  const items = await adapter.listSelected(tokens, { sessionId });
  listCache.set(key, { at: now, items });
  return items;
}

const NON_ITEM_ERRORS = new Set(["forbidden", "unauthorized", "not_found"]);

/**
 * Imports the next batch (max IMPORT_BATCH_SIZE items, sequential) of a finished selection into an album.
 * The client calls this repeatedly with `nextOffset` until it is null.
 */
export async function importBatch(actor: SessionUser, albumId: string, rawInput: ImportBatchInput): Promise<ImportBatchResult> {
  requireOwner(actor);
  const input = importInput.parse(rawInput);
  const adapter = configuredAdapter(input.sourceId);
  await getAlbumForOwner(actor, albumId); // clear 403/404 up front
  if (!input.refs && !input.sessionId) throw invalid("sourceSelectionMissing");

  const tokens = await getValidTokens(actor.id, adapter.id);
  const { offset } = input;
  const selection = { sessionId: input.sessionId };

  let total: number;
  let items: RemoteItem[];
  if (input.refs) {
    // Client-picker sources: slice before resolving so only this batch's metadata is requested.
    const refs = [...new Set(input.refs)];
    total = refs.length;
    const slice = refs.slice(offset, offset + IMPORT_BATCH_SIZE);
    items = slice.length > 0 ? await adapter.listSelected(tokens, { sessionId: input.sessionId, refs: slice }) : [];
  } else {
    const all = await listSessionItems(adapter, tokens, actor.id, input.sessionId!);
    total = all.length;
    items = all.slice(offset, offset + IMPORT_BATCH_SIZE);
  }

  const db = await getDb();
  const result: ImportBatchResult = { imported: 0, skipped: 0, failed: [], nextOffset: null, total };

  for (const item of items) {
    // Known non-image (video, document) → skipped. Unknown mime ("") is resolved by fetchItem.
    if (item.mimeType && !item.mimeType.startsWith("image/")) {
      result.skipped++;
      continue;
    }
    try {
      const existing = await db.findOne<Photo & Doc>(col("photos"), {
        where: [
          { field: "albumId", op: "eq", value: albumId },
          { field: "source", op: "eq", value: adapter.id },
          { field: "sourceRef", op: "eq", value: item.ref },
        ],
      });
      if (existing) {
        result.skipped++;
        continue;
      }
      const fetched = await adapter.fetchItem(tokens, item, selection);
      if (!fetched.contentType.startsWith("image/")) {
        result.skipped++;
        continue;
      }
      await addPhoto(actor, albumId, {
        data: fetched.data,
        filename: fetched.filename,
        contentType: fetched.contentType,
        source: adapter.id,
        sourceRef: item.ref,
        takenAt: fetched.takenAt,
      });
      result.imported++;
    } catch (e) {
      if (e instanceof UnsupportedItemError) {
        result.skipped++;
      } else if (e instanceof AppError && e.code === "conflict" && e.messageKey === "duplicatePhoto") {
        result.skipped++;
      } else if (e instanceof AppError && NON_ITEM_ERRORS.has(e.code) && !e.messageKey.startsWith("source")) {
        throw e; // e.g. album no longer owned: abort the whole batch
      } else {
        const key = e instanceof AppError ? e.messageKey : "sourceImportFailed";
        if (!(e instanceof AppError)) console.error(`[sources] import of ${item.ref} failed:`, e instanceof Error ? e.message : e);
        result.failed.push({ ref: item.ref, filename: item.filename, error: key });
      }
    }
  }

  const next = offset + IMPORT_BATCH_SIZE;
  result.nextOffset = next < total ? next : null;

  if (result.nextOffset === null) {
    listCache.delete(`${actor.id}:${adapter.id}:${input.sessionId ?? ""}`);
    try {
      await adapter.finishSelection?.(tokens, selection);
    } catch {
      // best effort cleanup
    }
  }
  return result;
}
