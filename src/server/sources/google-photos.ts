import "server-only";
import type { FetchedItem, OAuthTokens, PhotoSourceAdapter, RemoteItem, SelectionStart } from "../ports/photo-source";
import { config } from "../config";
import { AppError } from "../errors";
import { downloadBytes, googleJson, isGoogleUserContentUrl, parseDurationMs, UnsupportedItemError } from "./http";

/**
 * Google Photos Picker API adapter.
 * https://developers.google.com/photos/picker/guides/get-started-picker
 *
 * Flow: create PickingSession → user picks in Google's UI (new window) → poll until
 * `mediaItemsSet` → list media items → download `baseUrl=d` with the Bearer token → delete session.
 */

const API = "https://photospicker.googleapis.com/v1";
export const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const MIN_POLL_MS = 1000;
const DEFAULT_POLL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const SESSION_ID = /^[A-Za-z0-9_.~-]{1,300}$/;

interface PickingSession {
  id: string;
  pickerUri: string;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
  expireTime?: string;
  mediaItemsSet?: boolean;
}

interface PickedMediaItem {
  id: string;
  createTime?: string;
  type?: "TYPE_UNSPECIFIED" | "PHOTO" | "VIDEO";
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
}

/** RemoteItem plus the short-lived download URL (only valid within the same import request). */
export interface PhotosRemoteItem extends RemoteItem {
  baseUrl: string;
}

function checkSessionId(id: string): string {
  if (!SESSION_ID.test(id)) throw new AppError("validation", "sourceInvalidSession");
  return encodeURIComponent(id);
}

export const googlePhotosAdapter: PhotoSourceAdapter = {
  id: "google-photos",
  labelKey: "sources.googlePhotos",
  scopes: [PHOTOS_SCOPE],

  isConfigured() {
    const { clientId, clientSecret } = config().googleSources;
    return Boolean(clientId && clientSecret);
  },

  async startSelection(tokens: OAuthTokens): Promise<SelectionStart> {
    const session = await googleJson<PickingSession>(`${API}/sessions`, tokens.accessToken, { method: "POST", body: {} });
    if (!session.id || !session.pickerUri) throw new AppError("conflict", "sourceRequestFailed", "Invalid picking session");
    return {
      kind: "external-window",
      url: `${session.pickerUri.replace(/\/$/, "")}/autoclose`,
      sessionId: session.id,
      pollIntervalMs: Math.max(MIN_POLL_MS, parseDurationMs(session.pollingConfig?.pollInterval, DEFAULT_POLL_MS)),
      timeoutMs: parseDurationMs(session.pollingConfig?.timeoutIn, DEFAULT_TIMEOUT_MS),
    };
  },

  async pollSelection(tokens, sessionId) {
    const session = await googleJson<PickingSession>(`${API}/sessions/${checkSessionId(sessionId)}`, tokens.accessToken);
    return { done: session.mediaItemsSet === true };
  },

  /** Returns ALL picked items including videos (the orchestrator counts non-images as skipped). */
  async listSelected(tokens, selection): Promise<RemoteItem[]> {
    if (!selection.sessionId) throw new AppError("validation", "sourceInvalidSession");
    checkSessionId(selection.sessionId);
    const items: PhotosRemoteItem[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({ sessionId: selection.sessionId, pageSize: "100" });
      if (pageToken) qs.set("pageToken", pageToken);
      const page = await googleJson<{ mediaItems?: PickedMediaItem[]; nextPageToken?: string }>(
        `${API}/mediaItems?${qs.toString()}`,
        tokens.accessToken,
      );
      for (const m of page.mediaItems ?? []) {
        const file = m.mediaFile;
        if (!m.id || !file?.baseUrl) continue;
        const isVideo = m.type === "VIDEO";
        items.push({
          ref: m.id,
          filename: file.filename || `${m.id}.jpg`,
          mimeType: isVideo ? file.mimeType || "video/mp4" : file.mimeType || "image/jpeg",
          takenAt: m.createTime ?? null,
          width: file.mediaFileMetadata?.width,
          height: file.mediaFileMetadata?.height,
          baseUrl: file.baseUrl,
        });
      }
      pageToken = page.nextPageToken || undefined;
    } while (pageToken);
    return items;
  },

  async fetchItem(tokens, item): Promise<FetchedItem> {
    if (!item.mimeType.startsWith("image/")) throw new UnsupportedItemError(item.mimeType);
    const baseUrl = (item as Partial<PhotosRemoteItem>).baseUrl;
    // SSRF guard: only Google's content hosts over https, validated again for every redirect hop.
    if (!baseUrl || !isGoogleUserContentUrl(baseUrl)) throw new AppError("validation", "sourceHostNotAllowed");
    // "=d" requests the original bytes incl. metadata (needs the Bearer token).
    const { data, contentType } = await downloadBytes(`${baseUrl}=d`, tokens.accessToken, isGoogleUserContentUrl);
    const type = contentType && contentType !== "application/octet-stream" ? contentType : item.mimeType;
    if (!type.startsWith("image/")) throw new UnsupportedItemError(type);
    return { data, contentType: type, filename: item.filename, takenAt: item.takenAt };
  },

  async finishSelection(tokens, selection) {
    if (!selection.sessionId || !SESSION_ID.test(selection.sessionId)) return;
    try {
      await fetch(`${API}/sessions/${encodeURIComponent(selection.sessionId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // best effort
    }
  },
};
