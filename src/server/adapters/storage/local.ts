import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { BlobStorage } from "../../ports/blob-storage";
import { assertSafeKey } from "./keys";

/**
 * Local filesystem BlobStorage. Object `<key>` is stored as file `<dir>/<key>` plus a sidecar
 * `<dir>/<key>.meta.json` holding the content type. Keys are validated (no `..`, no absolute paths).
 */
export function createLocalStorage(dir: string): BlobStorage {
  const root = path.resolve(dir);

  function resolve(key: string, kind: "key" | "prefix" = "key"): string {
    assertSafeKey(key, kind);
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Invalid blob ${kind}: escapes storage root`);
    return full;
  }

  const isNotFound = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "ENOTDIR";

  async function writeAtomic(file: string, data: Buffer | string) {
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  }

  async function* walk(dirPath: string): AsyncGenerator<string> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (e) {
      if (isNotFound(e)) return;
      throw e;
    }
    for (const entry of entries) {
      const p = path.join(dirPath, entry.name);
      if (entry.isDirectory()) yield* walk(p);
      else yield p;
    }
  }

  async function pruneEmptyDirs(from: string) {
    let cur = from;
    while (cur !== root && cur.startsWith(root + path.sep)) {
      try {
        await fs.rmdir(cur);
      } catch {
        return; // not empty or already gone
      }
      cur = path.dirname(cur);
    }
  }

  return {
    async put(key, data, contentType) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await writeAtomic(file, data);
      await writeAtomic(`${file}.meta.json`, JSON.stringify({ contentType }));
    },

    async get(key) {
      const file = resolve(key);
      let data: Buffer;
      try {
        data = await fs.readFile(file);
      } catch (e) {
        if (isNotFound(e)) return null;
        if ((e as NodeJS.ErrnoException).code === "EISDIR") return null;
        throw e;
      }
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await fs.readFile(`${file}.meta.json`, "utf8")) as { contentType?: string };
        if (meta.contentType) contentType = meta.contentType;
      } catch {
        // missing/corrupt sidecar: fall back to octet-stream
      }
      return { data, contentType };
    },

    async exists(key) {
      try {
        return (await fs.stat(resolve(key))).isFile();
      } catch (e) {
        if (isNotFound(e)) return false;
        throw e;
      }
    },

    async delete(key) {
      const file = resolve(key);
      for (const f of [file, `${file}.meta.json`]) {
        try {
          await fs.unlink(f);
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
      }
      await pruneEmptyDirs(path.dirname(file));
    },

    async deletePrefix(prefix) {
      resolve(prefix, "prefix");
      const startDir = prefix.endsWith("/") ? resolve(prefix, "prefix") : path.dirname(resolve(prefix, "prefix"));
      const dirs = new Set<string>();
      for await (const file of walk(startDir)) {
        const key = path.relative(root, file).split(path.sep).join("/");
        if (!key.startsWith(prefix)) continue;
        try {
          await fs.unlink(file);
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
        dirs.add(path.dirname(file));
      }
      for (const d of dirs) await pruneEmptyDirs(d);
    },
  };
}
