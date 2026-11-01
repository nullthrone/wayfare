import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/server/config";
import { json, setGoogleEnv } from "./helpers";
import { googlePhotosAdapter, type PhotosRemoteItem } from "@/server/sources/google-photos";
import { googleDriveAdapter, parseExifTime } from "@/server/sources/google-drive";
import { isGoogleDriveDownloadUrl, isGoogleUserContentUrl, parseDurationMs, UnsupportedItemError } from "@/server/sources/http";
import { getSource, listAdapters } from "@/server/sources/registry";
import type { OAuthTokens } from "@/server/ports/photo-source";

const tokens: OAuthTokens = { accessToken: "tok", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "" };

beforeEach(() => {
  setGoogleEnv();
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GOOGLE_APP_ID;
  resetConfigForTests();
});
afterEach(() => vi.unstubAllGlobals());

const headersOf = (init: unknown) => (init as RequestInit).headers as Record<string, string>;

describe("host allow-list (SSRF)", () => {
  it.each([
    ["https://lh3.googleusercontent.com/abc", true],
    ["https://googleusercontent.com/abc", true],
    ["http://lh3.googleusercontent.com/abc", false],
    ["https://evil.example/lh3.googleusercontent.com", false],
    ["https://googleusercontent.com.evil.example/x", false],
    ["https://notgoogleusercontent.com/x", false],
    ["https://user:pw@lh3.googleusercontent.com/x", false],
    ["http://169.254.169.254/latest/meta-data", false],
    ["not a url", false],
  ])("%s → %s", (url, ok) => expect(isGoogleUserContentUrl(url)).toBe(ok));

  it("drive download hosts", () => {
    expect(isGoogleDriveDownloadUrl("https://www.googleapis.com/drive/v3/files/x?alt=media")).toBe(true);
    expect(isGoogleDriveDownloadUrl("https://doc-0g.googleusercontent.com/x")).toBe(true);
    expect(isGoogleDriveDownloadUrl("https://evil.example/")).toBe(false);
  });

  it("parseDurationMs", () => {
    expect(parseDurationMs("3.5s", 1)).toBe(3500);
    expect(parseDurationMs("1800s", 1)).toBe(1_800_000);
    expect(parseDurationMs(undefined, 42)).toBe(42);
    expect(parseDurationMs("abc", 42)).toBe(42);
  });
});

describe("registry / configuration", () => {
  it("lists both adapters and rejects unknown ids", () => {
    expect(listAdapters().map((a) => a.id)).toEqual(["google-photos", "google-drive"]);
    expect(getSource("google-photos")).toBe(googlePhotosAdapter);
    expect(() => getSource("dropbox")).toThrowError();
    expect(() => getSource("__proto__")).toThrowError();
  });

  it("Photos needs client id+secret, Drive additionally API key + app id", () => {
    expect(googlePhotosAdapter.isConfigured()).toBe(true);
    expect(googleDriveAdapter.isConfigured()).toBe(false);
    process.env.GOOGLE_API_KEY = "k";
    resetConfigForTests();
    expect(googleDriveAdapter.isConfigured()).toBe(false);
    process.env.GOOGLE_APP_ID = "123";
    resetConfigForTests();
    expect(googleDriveAdapter.isConfigured()).toBe(true);
    delete process.env.GOOGLE_SOURCES_CLIENT_SECRET;
    delete process.env.AUTH_GOOGLE_SECRET;
    resetConfigForTests();
    expect(googlePhotosAdapter.isConfigured()).toBe(false);
    expect(googleDriveAdapter.isConfigured()).toBe(false);
  });
});

describe("Google Photos adapter", () => {
  it("startSelection creates a session and returns an autoclose URL with parsed polling config", async () => {
    const fetchMock = vi.fn(async () =>
      json({ id: "sess1", pickerUri: "https://photos.google.com/picker/abc", pollingConfig: { pollInterval: "3.5s", timeoutIn: "600s" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const start = await googlePhotosAdapter.startSelection(tokens);
    expect(start).toEqual({
      kind: "external-window",
      url: "https://photos.google.com/picker/abc/autoclose",
      sessionId: "sess1",
      pollIntervalMs: 3500,
      timeoutMs: 600_000,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://photospicker.googleapis.com/v1/sessions");
    expect(init.method).toBe("POST");
    expect(headersOf(init).authorization).toBe("Bearer tok");
  });

  it("pollSelection reflects mediaItemsSet", async () => {
    const answers = [{ id: "s" }, { id: "s", mediaItemsSet: true }];
    vi.stubGlobal("fetch", vi.fn(async () => json(answers.shift())));
    expect(await googlePhotosAdapter.pollSelection!(tokens, "s")).toEqual({ done: false });
    expect(await googlePhotosAdapter.pollSelection!(tokens, "s")).toEqual({ done: true });
  });

  it("rejects malformed session ids before building URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(googlePhotosAdapter.pollSelection!(tokens, "../../etc?x=1")).rejects.toMatchObject({ messageKey: "sourceInvalidSession" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listSelected pages through results and keeps videos for the orchestrator to skip", async () => {
    const pages = [
      {
        mediaItems: [
          { id: "a", createTime: "2026-01-01T10:00:00Z", type: "PHOTO", mediaFile: { baseUrl: "https://lh3.googleusercontent.com/a", mimeType: "image/jpeg", filename: "a.jpg", mediaFileMetadata: { width: 10, height: 20 } } },
          { id: "v", type: "VIDEO", mediaFile: { baseUrl: "https://lh3.googleusercontent.com/v", mimeType: "video/mp4", filename: "v.mp4" } },
        ],
        nextPageToken: "p2",
      },
      { mediaItems: [{ id: "b", type: "PHOTO", mediaFile: { baseUrl: "https://lh3.googleusercontent.com/b", mimeType: "image/heic", filename: "b.heic" } }] },
    ];
    const fetchMock = vi.fn(async () => json(pages.shift()));
    vi.stubGlobal("fetch", fetchMock);
    const items = await googlePhotosAdapter.listSelected(tokens, { sessionId: "sess1" });
    expect(items.map((i) => [i.ref, i.mimeType])).toEqual([["a", "image/jpeg"], ["v", "video/mp4"], ["b", "image/heic"]]);
    expect(items[0]).toMatchObject({ takenAt: "2026-01-01T10:00:00Z", width: 10, height: 20, filename: "a.jpg" });
    const urls = fetchMock.mock.calls.map((c) => new URL((c as unknown as [string])[0]));
    expect(urls[0]!.searchParams.get("sessionId")).toBe("sess1");
    expect(urls[0]!.searchParams.get("pageSize")).toBe("100");
    expect(urls[0]!.searchParams.get("pageToken")).toBeNull();
    expect(urls[1]!.searchParams.get("pageToken")).toBe("p2");
  });

  it("fetchItem downloads baseUrl=d with the Bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const item: PhotosRemoteItem = { ref: "a", filename: "a.jpg", mimeType: "image/jpeg", takenAt: "2026-01-01T10:00:00Z", baseUrl: "https://lh3.googleusercontent.com/a" };
    const out = await googlePhotosAdapter.fetchItem(tokens, item, { sessionId: "s" });
    expect([...out.data]).toEqual([1, 2, 3]);
    expect(out).toMatchObject({ contentType: "image/jpeg", filename: "a.jpg", takenAt: "2026-01-01T10:00:00Z" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lh3.googleusercontent.com/a=d");
    expect(headersOf(init).authorization).toBe("Bearer tok");
  });

  it("fetchItem refuses foreign hosts without sending any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const item = { ref: "a", filename: "a.jpg", mimeType: "image/jpeg", takenAt: null, baseUrl: "https://169.254.169.254/x" } satisfies PhotosRemoteItem;
    await expect(googlePhotosAdapter.fetchItem(tokens, item, {})).rejects.toMatchObject({ messageKey: "sourceHostNotAllowed" });
    await expect(googlePhotosAdapter.fetchItem(tokens, { ...item, baseUrl: undefined } as unknown as PhotosRemoteItem, {})).rejects.toMatchObject({ messageKey: "sourceHostNotAllowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchItem blocks redirects to foreign hosts and never leaks the token", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }));
    vi.stubGlobal("fetch", fetchMock);
    const item: PhotosRemoteItem = { ref: "a", filename: "a.jpg", mimeType: "image/jpeg", takenAt: null, baseUrl: "https://lh3.googleusercontent.com/a" };
    await expect(googlePhotosAdapter.fetchItem(tokens, item, {})).rejects.toMatchObject({ messageKey: "sourceHostNotAllowed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetchItem rejects videos and non-image responses as unsupported", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })));
    const base = { ref: "a", filename: "a", takenAt: null, baseUrl: "https://lh3.googleusercontent.com/a" };
    await expect(googlePhotosAdapter.fetchItem(tokens, { ...base, mimeType: "video/mp4" }, {})).rejects.toBeInstanceOf(UnsupportedItemError);
    await expect(googlePhotosAdapter.fetchItem(tokens, { ...base, mimeType: "image/jpeg" }, {})).rejects.toBeInstanceOf(UnsupportedItemError);
  });

  it("maps HTTP failures to AppErrors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(googlePhotosAdapter.startSelection(tokens)).rejects.toMatchObject({ messageKey: "sourceReconnectRequired" });
  });

  it("finishSelection deletes the session and swallows errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("boom");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(googlePhotosAdapter.finishSelection!(tokens, { sessionId: "sess1" })).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://photospicker.googleapis.com/v1/sessions/sess1");
    expect(init.method).toBe("DELETE");
  });
});

describe("Google Drive adapter", () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = "api-key";
    process.env.GOOGLE_APP_ID = "123456";
    resetConfigForTests();
  });

  it("startSelection returns the client picker config", async () => {
    expect(await googleDriveAdapter.startSelection(tokens)).toEqual({
      kind: "client-picker",
      widget: "google-drive",
      config: { apiKey: "api-key", appId: "123456", accessToken: "tok" },
    });
  });

  it("listSelected fetches metadata per ref and converts EXIF time", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const id = new URL(url).pathname.split("/").pop();
      if (id === "fileBBBBBB") return new Response("{}", { status: 404 });
      return json({ id, name: `${id}.jpg`, mimeType: id === "fileCCCCCC" ? "application/pdf" : "image/jpeg", imageMediaMetadata: { time: "2019:06:12 14:30:00", width: 4, height: 3 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const items = await googleDriveAdapter.listSelected(tokens, { refs: ["fileAAAAAA", "fileBBBBBB", "fileCCCCCC", "fileAAAAAA"] });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ ref: "fileAAAAAA", mimeType: "image/jpeg", takenAt: "2019-06-12T14:30:00.000Z", filename: "fileAAAAAA.jpg" });
    expect(items[1]).toMatchObject({ ref: "fileBBBBBB", mimeType: "" });
    expect(items[2]!.mimeType).toBe("application/pdf");
    const first = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(first.searchParams.get("fields")).toBe("id,name,mimeType,imageMediaMetadata(time,width,height),capabilities(canDownload)");
  });

  it("rejects refs that are not Drive ids", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(googleDriveAdapter.listSelected(tokens, { refs: ["../about"] })).rejects.toMatchObject({ messageKey: "sourceInvalidRef" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchItem downloads alt=media; non-images are unsupported", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([9]), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await googleDriveAdapter.fetchItem(tokens, { ref: "fileAAAAAA", filename: "x.png", mimeType: "image/png", takenAt: null }, {});
    expect(out.contentType).toBe("image/png");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://www.googleapis.com/drive/v3/files/fileAAAAAA?alt=media");
    await expect(googleDriveAdapter.fetchItem(tokens, { ref: "fileAAAAAA", filename: "x.pdf", mimeType: "application/pdf", takenAt: null }, {})).rejects.toBeInstanceOf(UnsupportedItemError);
  });

  it("fetchItem resolves unknown mime types via metadata and honours canDownload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: "x", name: "n.jpg", mimeType: "image/jpeg", capabilities: { canDownload: false } })));
    await expect(googleDriveAdapter.fetchItem(tokens, { ref: "fileAAAAAA", filename: "x", mimeType: "", takenAt: null }, {})).rejects.toMatchObject({ messageKey: "sourceAccessDenied" });
  });

  it("parseExifTime", () => {
    expect(parseExifTime("2019:06:12 14:30:00")).toBe("2019-06-12T14:30:00.000Z");
    expect(parseExifTime("2019-06-12T14:30:00Z")).toBe("2019-06-12T14:30:00.000Z");
    expect(parseExifTime("garbage")).toBeNull();
    expect(parseExifTime(undefined)).toBeNull();
  });
});
