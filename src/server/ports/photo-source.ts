import type { PhotoSourceId } from "@/domain/types";

/**
 * PhotoSource port (Adapter Pattern) for importing photos from cloud services.
 * Photos are always COPIED into Wayfare storage (see docs/adr/0003-import-not-link.md):
 * Google Photos Picker baseUrls expire after ~60 minutes, so live linking is impossible.
 *
 * Adding a new source = implement this interface in src/server/sources/<id>.ts
 * and register it in src/server/sources/registry.ts.
 */

export type CloudSourceId = Exclude<PhotoSourceId, "upload" | "guest-upload">;

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** epoch millis */
  expiresAt: number;
  scope: string;
}

/** How the client lets the user pick photos. */
export type SelectionStart =
  /** Open `url` in a new window (Google Photos Picker), then poll `pollSelection` with `sessionId`. */
  | { kind: "external-window"; url: string; sessionId: string; pollIntervalMs: number; timeoutMs: number }
  /** Load a client-side picker widget (Google Drive Picker) with the given public config. */
  | { kind: "client-picker"; widget: "google-drive"; config: { apiKey: string; appId: string; accessToken: string } };

export interface RemoteItem {
  /** Id in the source system (Photos media item id / Drive file id). */
  ref: string;
  filename: string;
  mimeType: string;
  takenAt: string | null;
  width?: number;
  height?: number;
}

export interface FetchedItem {
  data: Buffer;
  contentType: string;
  filename: string;
  takenAt: string | null;
}

export interface PhotoSourceAdapter {
  readonly id: CloudSourceId;
  /** i18n key for the display name, e.g. "sources.googlePhotos". */
  readonly labelKey: string;
  readonly scopes: string[];
  /** True if the operator configured the required credentials. */
  isConfigured(): boolean;
  /**
   * Begin a selection. For "external-window" sources `selectionRef` is the session id,
   * for "client-picker" sources the client later sends the picked refs directly.
   */
  startSelection(tokens: OAuthTokens): Promise<SelectionStart>;
  /** Only for external-window sources. */
  pollSelection?(tokens: OAuthTokens, sessionId: string): Promise<{ done: boolean }>;
  /** Resolve the selection to items. `refs` is set for client-picker sources. */
  listSelected(tokens: OAuthTokens, selection: { sessionId?: string; refs?: string[] }): Promise<RemoteItem[]>;
  /** Download one item (full resolution). Must validate hosts (SSRF). */
  fetchItem(tokens: OAuthTokens, item: RemoteItem, selection: { sessionId?: string }): Promise<FetchedItem>;
  /** Optional cleanup after import (e.g. delete Picker session). */
  finishSelection?(tokens: OAuthTokens, selection: { sessionId?: string }): Promise<void>;
}
