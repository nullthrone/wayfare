import "server-only";
import type { SessionUser, SourceConnection } from "@/domain/types";
import type { CloudSourceId, SelectionStart } from "../ports/photo-source";
import { notImplemented } from "../errors";

/**
 * Photo source orchestration (Google Photos, Google Drive). See ports/photo-source.ts.
 *
 * Routes (implemented by the sources workstream):
 *   GET  /api/sources/{sourceId}/connect   → redirects to Google OAuth (state = signed {userId, sourceId, returnTo})
 *   GET  /api/sources/callback             → exchanges code, stores encrypted tokens, redirects back
 *   POST /api/sources/{sourceId}/disconnect
 *   POST /api/sources/{sourceId}/selection → SelectionStart
 *   GET  /api/sources/{sourceId}/selection/{sessionId} → { done }
 *   POST /api/albums/{albumId}/import      → body { sourceId, sessionId?, refs?, offset? } imports a batch
 *                                            of max 10 items per call; returns { imported, skipped, failed, nextOffset|null }
 */

export interface SourceInfo {
  id: CloudSourceId;
  labelKey: string;
  configured: boolean;
  connection: Pick<SourceConnection, "accountEmail" | "createdAt"> | null;
}

export async function listSources(actor: SessionUser): Promise<SourceInfo[]> {
  void actor;
  return notImplemented("listSources");
}

export async function startSelection(actor: SessionUser, sourceId: CloudSourceId): Promise<SelectionStart> {
  void actor; void sourceId;
  return notImplemented("startSelection");
}
