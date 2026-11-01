import "server-only";
import type { FetchedItem, OAuthTokens, PhotoSourceAdapter, RemoteItem, SelectionStart } from "../ports/photo-source";
import { config } from "../config";
import { AppError } from "../errors";
import { downloadBytes, googleJson, isGoogleDriveDownloadUrl, UnsupportedItemError } from "./http";

/**
 * Google Drive adapter. Scope `drive.file` (non-sensitive) + the client-side Google Picker:
 * the browser picks files, the server then downloads exactly those file ids.
 * https://developers.google.com/drive/picker/guides/overview
 */

const API = "https://www.googleapis.com/drive/v3/files";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Drive file ids are url-safe; reject anything else before building URLs. */
const FILE_ID = /^[A-Za-z0-9_-]{6,200}$/;
const LIST_CONCURRENCY = 4;

interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  imageMediaMetadata?: { time?: string; width?: number; height?: number };
  capabilities?: { canDownload?: boolean };
}

/** "2019:06:12 14:30:00" (EXIF, no zone) → ISO string, interpreted as UTC. Returns null if unparsable. */
export function parseExifTime(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function checkId(ref: string): string {
  if (!FILE_ID.test(ref)) throw new AppError("validation", "sourceInvalidRef");
  return ref;
}

async function loadMetadata(tokens: OAuthTokens, ref: string): Promise<DriveFile> {
  const fields = encodeURIComponent("id,name,mimeType,imageMediaMetadata(time,width,height),capabilities(canDownload)");
  return googleJson<DriveFile>(`${API}/${encodeURIComponent(checkId(ref))}?fields=${fields}`, tokens.accessToken);
}

export const googleDriveAdapter: PhotoSourceAdapter = {
  id: "google-drive",
  labelKey: "sources.googleDrive",
  scopes: [DRIVE_SCOPE],

  isConfigured() {
    const cfg = config();
    const { clientId, clientSecret } = cfg.googleSources;
    return Boolean(clientId && clientSecret && cfg.GOOGLE_API_KEY && cfg.GOOGLE_APP_ID);
  },

  async startSelection(tokens: OAuthTokens): Promise<SelectionStart> {
    const cfg = config();
    if (!cfg.GOOGLE_API_KEY || !cfg.GOOGLE_APP_ID) throw new AppError("validation", "sourceNotConfigured");
    return {
      kind: "client-picker",
      widget: "google-drive",
      // The Picker needs the OAuth token in the browser (scope drive.file only; short-lived).
      config: { apiKey: cfg.GOOGLE_API_KEY, appId: cfg.GOOGLE_APP_ID, accessToken: tokens.accessToken },
    };
  },

  async listSelected(tokens, selection): Promise<RemoteItem[]> {
    const refs = [...new Set(selection.refs ?? [])];
    const out: RemoteItem[] = new Array(refs.length);
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const i = next++;
        const ref = refs[i]!;
        try {
          const f = await loadMetadata(tokens, ref);
          out[i] = {
            ref,
            filename: f.name || ref,
            mimeType: f.mimeType ?? "",
            takenAt: parseExifTime(f.imageMediaMetadata?.time),
            width: f.imageMediaMetadata?.width,
            height: f.imageMediaMetadata?.height,
          };
        } catch (e) {
          // Unknown mimeType ("") → fetchItem retries and surfaces the real error for this ref.
          if (e instanceof AppError && e.code === "validation") throw e;
          out[i] = { ref, filename: ref, mimeType: "", takenAt: null };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(LIST_CONCURRENCY, refs.length) }, worker));
    return out;
  },

  async fetchItem(tokens, item): Promise<FetchedItem> {
    let meta: RemoteItem = item;
    if (!item.mimeType) {
      const f = await loadMetadata(tokens, item.ref);
      if (f.capabilities?.canDownload === false) throw new AppError("forbidden", "sourceAccessDenied");
      meta = {
        ref: item.ref,
        filename: f.name || item.ref,
        mimeType: f.mimeType ?? "",
        takenAt: parseExifTime(f.imageMediaMetadata?.time),
      };
    }
    if (!meta.mimeType.startsWith("image/")) throw new UnsupportedItemError(meta.mimeType || "unknown");
    const url = `${API}/${encodeURIComponent(checkId(item.ref))}?alt=media`;
    const { data, contentType } = await downloadBytes(url, tokens.accessToken, isGoogleDriveDownloadUrl);
    const type = contentType && contentType !== "application/octet-stream" ? contentType : meta.mimeType;
    if (!type.startsWith("image/")) throw new UnsupportedItemError(type);
    return { data, contentType: type, filename: meta.filename, takenAt: meta.takenAt };
  },
};
