#!/usr/bin/env node
/**
 * Normalises sample photos for e2e/fixtures/photos:
 *   node scripts/import-sample-photos.mjs <source-dir>
 *
 * - matches source files to the names listed in e2e/fixtures/photos/PROMPTS.md
 *   (case-insensitive, any image extension, e.g. "Travel-01.png" → travel-01.jpg)
 * - auto-rotates, resizes to max. 1600 px (long edge), strips ALL metadata
 *   (EXIF, XMP, C2PA manifests), writes progressive JPEG q82
 * - reports missing and unexpected files
 */
import { readdirSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/import-sample-photos.mjs <source-dir>");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "e2e/fixtures/photos");
const prompts = readFileSync(join(outDir, "PROMPTS.md"), "utf8");
const expected = [...prompts.matchAll(/`([a-z]+-\d{2})\.jpg`/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name.startsWith(".") || name === "__MACOSX") return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(resolve(src)).filter((f) => /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f));
const byStem = new Map(files.map((f) => [basename(f, extname(f)).toLowerCase().replace(/[_\s]+/g, "-"), f]));

mkdirSync(outDir, { recursive: true });
const missing = [];
for (const stem of expected) {
  const file = byStem.get(stem);
  if (!file) {
    missing.push(stem);
    continue;
  }
  const out = join(outDir, `${stem}.jpg`);
  const info = await sharp(file)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(out); // sharp drops metadata unless .withMetadata() is called
  console.log(`✓ ${stem}.jpg  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB  ← ${basename(file)}`);
  byStem.delete(stem);
}
if (missing.length) console.log(`\nmissing (placeholders will be used): ${missing.join(", ")}`);
if (byStem.size) console.log(`\nunmatched source files (ignored): ${[...byStem.values()].map((f) => basename(f)).join(", ")}`);
