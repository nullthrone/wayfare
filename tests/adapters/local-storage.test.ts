import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalStorage } from "@/server/adapters/storage/local";
import type { BlobStorage } from "@/server/ports/blob-storage";

describe("local blob storage", () => {
  let dir: string;
  let outside: string;
  let blobs: BlobStorage;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "wayfare-blobs-"));
    dir = path.join(base, "root");
    outside = path.join(base, "outside.txt");
    fs.writeFileSync(outside, "secret");
    blobs = createLocalStorage(dir);
  });
  afterEach(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));

  it("stores, reads back, checks existence and deletes", async () => {
    const data = Buffer.from([1, 2, 3, 250]);
    await blobs.put("albums/a1/p1/display.webp", data, "image/webp");
    expect(await blobs.exists("albums/a1/p1/display.webp")).toBe(true);
    const got = await blobs.get("albums/a1/p1/display.webp");
    expect(got?.contentType).toBe("image/webp");
    expect(got?.data.equals(data)).toBe(true);
    expect(fs.existsSync(path.join(dir, "albums/a1/p1/display.webp.meta.json"))).toBe(true);

    await blobs.delete("albums/a1/p1/display.webp");
    expect(await blobs.exists("albums/a1/p1/display.webp")).toBe(false);
    expect(await blobs.get("albums/a1/p1/display.webp")).toBeNull();
    await expect(blobs.delete("albums/a1/p1/display.webp")).resolves.toBeUndefined();
  });

  it("overwrites existing objects", async () => {
    await blobs.put("k", Buffer.from("one"), "text/plain");
    await blobs.put("k", Buffer.from("two"), "text/html");
    const got = await blobs.get("k");
    expect(got?.data.toString()).toBe("two");
    expect(got?.contentType).toBe("text/html");
  });

  it("returns null / false for missing keys", async () => {
    expect(await blobs.get("nope/nothing")).toBeNull();
    expect(await blobs.exists("nope/nothing")).toBe(false);
    await blobs.put("dir/file", Buffer.from("x"), "text/plain");
    expect(await blobs.get("dir")).toBeNull(); // a directory is not an object
    expect(await blobs.exists("dir")).toBe(false);
  });

  it("deletePrefix removes every object below the prefix and nothing else", async () => {
    await blobs.put("albums/a1/p1/thumb.webp", Buffer.from("1"), "image/webp");
    await blobs.put("albums/a1/p1/display.webp", Buffer.from("2"), "image/webp");
    await blobs.put("albums/a1/p2/thumb.webp", Buffer.from("3"), "image/webp");
    await blobs.put("albums/a10/p1/thumb.webp", Buffer.from("4"), "image/webp");
    await blobs.put("albums/a2/p1/thumb.webp", Buffer.from("5"), "image/webp");

    await blobs.deletePrefix("albums/a1/");
    expect(await blobs.exists("albums/a1/p1/thumb.webp")).toBe(false);
    expect(await blobs.exists("albums/a1/p1/display.webp")).toBe(false);
    expect(await blobs.exists("albums/a1/p2/thumb.webp")).toBe(false);
    expect(fs.existsSync(path.join(dir, "albums/a1"))).toBe(false);
    expect(await blobs.exists("albums/a10/p1/thumb.webp")).toBe(true);
    expect(await blobs.exists("albums/a2/p1/thumb.webp")).toBe(true);

    // plain string prefix (no trailing slash)
    await blobs.deletePrefix("albums/a1");
    expect(await blobs.exists("albums/a10/p1/thumb.webp")).toBe(false);
    expect(await blobs.exists("albums/a2/p1/thumb.webp")).toBe(true);

    await expect(blobs.deletePrefix("does/not/exist/")).resolves.toBeUndefined();
  });

  it("rejects path traversal and absolute keys", async () => {
    const bad = ["../outside.txt", "a/../../outside.txt", "..", "a/..", "/etc/passwd", "C:/Windows/x", "a\\b", "a\0b", "", "a/./b", "a//..//b"];
    for (const key of bad) {
      await expect(blobs.put(key, Buffer.from("x"), "text/plain"), `put ${JSON.stringify(key)}`).rejects.toThrow();
      await expect(blobs.get(key), `get ${JSON.stringify(key)}`).rejects.toThrow();
      await expect(blobs.exists(key), `exists ${JSON.stringify(key)}`).rejects.toThrow();
      await expect(blobs.delete(key), `delete ${JSON.stringify(key)}`).rejects.toThrow();
    }
    await expect(blobs.deletePrefix("../")).rejects.toThrow();
    await expect(blobs.deletePrefix("/")).rejects.toThrow();
    await expect(blobs.deletePrefix("")).rejects.toThrow();
    expect(fs.readFileSync(outside, "utf8")).toBe("secret");
  });

  it("does not let callers address sidecar metadata files", async () => {
    await expect(blobs.put("x.meta.json", Buffer.from("{}"), "application/json")).rejects.toThrow();
  });

  it("handles concurrent writes to the same key", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => blobs.put("same", Buffer.from(String(i)), "text/plain")));
    const got = await blobs.get("same");
    expect(got?.data.toString()).toMatch(/^\d+$/);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
