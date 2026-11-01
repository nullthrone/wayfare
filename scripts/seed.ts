/**
 * Demo seed: users, albums, photos, interactions and instance settings for the live demo and the
 * documentation screenshots.
 *
 *   WAYFARE_SECRET=... WAYFARE_DEMO_MODE=true DATA_DIR=./data-demo npm run seed -- --reset
 *
 * - Refuses to run unless WAYFARE_DEMO_MODE=true.
 * - `--reset` wipes the contents of DATA_DIR first (without it the script aborts on a non-empty instance).
 * - Photos: uses e2e/fixtures/photos/<file> when present, otherwise renders a procedural placeholder.
 * - Everything goes through the real services, so thumbnails/derivatives are real.
 *
 * Run via `npm run seed` (tsx + scripts/stub-server-only.cjs, which makes `server-only` a no-op outside Next.js).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { SessionUser } from "../src/domain/types";
import type { Theme } from "../src/domain/theme";

const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "e2e/fixtures/photos");
const PASSWORD = "wayfare-demo";
const WEDDING_PASSWORD = "lena-jonas";
const RESET = process.argv.includes("--reset");

// ------------------------------------------------------------------ guards (before any app import)

if (!["true", "1"].includes(String(process.env.WAYFARE_DEMO_MODE ?? ""))) {
  console.error("Refusing to seed: set WAYFARE_DEMO_MODE=true (the demo enables e-mail/password login with a public password).");
  process.exit(1);
}
process.env.DATA_DIR ||= "./data";
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR);

function wipeDataDir() {
  if (path.parse(DATA_DIR).root === DATA_DIR || DATA_DIR === ROOT || DATA_DIR === path.resolve(ROOT, "..")) {
    throw new Error(`Refusing to wipe suspicious DATA_DIR: ${DATA_DIR}`);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const name of fs.readdirSync(DATA_DIR)) fs.rmSync(path.join(DATA_DIR, name), { recursive: true, force: true });
}

// ------------------------------------------------------------------ placeholder photos

type Aspect = "4:3" | "3:4" | "1:1";
const SIZES: Record<Aspect, [number, number]> = { "4:3": [1600, 1200], "3:4": [1200, 1600], "1:1": [1400, 1400] };

/** Reads `| \`file\` | aspect | prompt |` rows from PROMPTS.md so placeholders follow the documented ratios. */
function readAspects(): Record<string, Aspect> {
  const out: Record<string, Aspect> = {};
  const md = fs.readFileSync(path.join(FIXTURES, "PROMPTS.md"), "utf8");
  for (const m of md.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\d+:\d+)\s*\|/gm)) {
    if (m[2] in SIZES) out[m[1]] = m[2] as Aspect;
  }
  return out;
}

interface Layer { color: string; base: number; amp: number; blur?: number; freq?: number }
interface Blob { color: string; x: number; y: number; r: number; o: number }
interface Scene {
  sky: string[];
  sun?: { x: number; y: number; r: number; color: string };
  layers?: Layer[];
  blobs?: Blob[];
  bokeh?: { color: string; count: number; min: number; max: number; y?: [number, number] };
  rects?: { color: string; x: number; y: number; w: number; h: number; o: number }[];
}

/** Deterministic PRNG (mulberry32) so re-seeding yields identical images. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneSvg(w: number, h: number, s: Scene, seed: number): string {
  const rnd = rng(seed);
  const parts: string[] = [];
  const stops = s.sky.map((c, i) => `<stop offset="${(i / (s.sky.length - 1)) * 100}%" stop-color="${c}"/>`).join("");
  parts.push(`<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.25" y2="1">${stops}</linearGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.32"/></radialGradient>
    <filter id="b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="b2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${Math.round(w / 40)}"/></filter>
    <filter id="b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(w / 14)}"/></filter>
  </defs>`);
  parts.push(`<rect width="${w}" height="${h}" fill="url(#sky)"/>`);
  if (s.sun) {
    const { x, y, r, color } = s.sun;
    parts.push(`<circle cx="${x * w}" cy="${y * h}" r="${r * w * 2.6}" fill="${color}" opacity="0.28" filter="url(#b3)"/>`);
    parts.push(`<circle cx="${x * w}" cy="${y * h}" r="${r * w}" fill="${color}" opacity="0.92" filter="url(#b1)"/>`);
  }
  for (const b of s.blobs ?? []) {
    parts.push(`<circle cx="${b.x * w}" cy="${b.y * h}" r="${b.r * w}" fill="${b.color}" opacity="${b.o}" filter="url(#b3)"/>`);
  }
  for (const r of s.rects ?? []) {
    parts.push(`<rect x="${r.x * w}" y="${r.y * h}" width="${r.w * w}" height="${r.h * h}" rx="${w / 90}" fill="${r.color}" opacity="${r.o}" filter="url(#b2)"/>`);
  }
  (s.layers ?? []).forEach((l, li) => {
    const p1 = rnd() * 6.28, p2 = rnd() * 6.28, f = (l.freq ?? 1.6) + li * 0.5;
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const y = (l.base + l.amp * (Math.sin(t * f * 3.14 + p1) + 0.5 * Math.sin(t * f * 7.1 + p2))) * h;
      pts.push(`${(t * w).toFixed(1)},${y.toFixed(1)}`);
    }
    parts.push(`<polygon points="0,${h} ${pts.join(" ")} ${w},${h}" fill="${l.color}" ${l.blur ? `filter="url(#b${l.blur > 1 ? 2 : 1})"` : ""}/>`);
  });
  if (s.bokeh) {
    const { color, count, min, max, y } = s.bokeh;
    for (let i = 0; i < count; i++) {
      const r = (min + rnd() * (max - min)) * w;
      const cy = (y ? y[0] + rnd() * (y[1] - y[0]) : rnd()) * h;
      const o = 0.1 + rnd() * 0.28;
      parts.push(`<circle cx="${(rnd() * w).toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="${o.toFixed(2)}" stroke="#fff" stroke-opacity="${(o * 0.5).toFixed(2)}" stroke-width="2" filter="url(#b1)"/>`);
    }
  }
  parts.push(`<rect width="${w}" height="${h}" fill="url(#vig)"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}

async function renderPlaceholder(scene: Scene, aspect: Aspect, seed: number): Promise<Buffer> {
  const [w, h] = SIZES[aspect];
  const base = await sharp(Buffer.from(sceneSvg(w, h, scene, seed))).png().toBuffer();
  // Subtle film grain: low-contrast noise blended with soft-light.
  const grain = await sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .linear(0.35, 128 * 0.65)
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: grain, blend: "soft-light" }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

const warm = "#fff1c9";
const SCENES: Record<string, Scene> = {
  // --- Toskana
  "travel-01.jpg": { sky: ["#f9e3b0", "#f4be7c", "#ec9a64"], sun: { x: 0.72, y: 0.36, r: 0.045, color: "#fff0c2" }, layers: [{ color: "#c2a860", base: 0.55, amp: 0.05, blur: 1 }, { color: "#8f9a4c", base: 0.64, amp: 0.06 }, { color: "#5b7b38", base: 0.76, amp: 0.05 }, { color: "#3d5a2b", base: 0.9, amp: 0.04, freq: 2.4 }], bokeh: { color: warm, count: 10, min: 0.006, max: 0.02, y: [0.05, 0.5] } },
  "travel-02.jpg": { sky: ["#e6b078", "#cf8a52", "#8f5a3a"], rects: [{ color: "#4c7a52", x: 0.08, y: 0.18, w: 0.18, h: 0.38, o: 0.8 }, { color: "#4c7a52", x: 0.74, y: 0.22, w: 0.16, h: 0.36, o: 0.8 }, { color: "#f6e3c2", x: 0.34, y: 0.04, w: 0.3, h: 0.9, o: 0.5 }], blobs: [{ color: "#fff0c8", x: 0.5, y: 0.2, r: 0.28, o: 0.55 }], bokeh: { color: "#d64a3a", count: 7, min: 0.01, max: 0.03, y: [0.55, 0.85] }, layers: [{ color: "#6e4a34", base: 0.92, amp: 0.02 }] },
  "travel-03.jpg": { sky: ["#2d3866", "#8670a6", "#f0a58a", "#f9d2a0"], layers: [{ color: "#8a4a3e", base: 0.66, amp: 0.025, freq: 3.2, blur: 1 }, { color: "#b5503a", base: 0.76, amp: 0.03, freq: 4 }, { color: "#7a3a30", base: 0.88, amp: 0.025, freq: 5 }], blobs: [{ color: "#ffd9a8", x: 0.3, y: 0.62, r: 0.2, o: 0.35 }], bokeh: { color: "#ffe2a8", count: 16, min: 0.004, max: 0.014, y: [0.55, 0.95] } },
  "travel-04.jpg": { sky: ["#7a4f2e", "#a8764a", "#6e4528"], blobs: [{ color: "#fff7e6", x: 0.3, y: 0.34, r: 0.17, o: 0.9 }, { color: "#fff7e6", x: 0.68, y: 0.62, r: 0.17, o: 0.9 }, { color: "#8b1d2c", x: 0.82, y: 0.2, r: 0.07, o: 0.85 }, { color: "#e8c585", x: 0.18, y: 0.8, r: 0.1, o: 0.6 }, { color: "#d9442f", x: 0.3, y: 0.34, r: 0.08, o: 0.55 }, { color: "#e9b64a", x: 0.68, y: 0.62, r: 0.07, o: 0.5 }], bokeh: { color: "#ffe0a0", count: 8, min: 0.006, max: 0.02 } },
  "travel-05.jpg": { sky: ["#6fb4ea", "#a9d4f2", "#e4f1fa"], blobs: [{ color: "#ffffff", x: 0.25, y: 0.2, r: 0.12, o: 0.7 }, { color: "#ffffff", x: 0.78, y: 0.14, r: 0.09, o: 0.6 }], layers: [{ color: "#8da25a", base: 0.5, amp: 0.02, blur: 1 }, { color: "#f0bf2a", base: 0.6, amp: 0.025 }, { color: "#e3a413", base: 0.78, amp: 0.02, freq: 3 }], rects: [{ color: "#b3281f", x: 0.38, y: 0.54, w: 0.22, h: 0.12, o: 0.95 }], bokeh: { color: "#fff6c0", count: 12, min: 0.004, max: 0.012, y: [0.7, 1] } },
  "travel-06.jpg": { sky: ["#dde8a2", "#b5cc66", "#7f9d3a"], layers: [{ color: "#9db05a", base: 0.32, amp: 0.04, blur: 2 }, { color: "#6f8f3a", base: 0.5, amp: 0.03, blur: 2 }, { color: "#3f5f26", base: 0.82, amp: 0.03 }], bokeh: { color: "#46255a", count: 14, min: 0.018, max: 0.045, y: [0.55, 0.95] }, blobs: [{ color: "#fff3b0", x: 0.7, y: 0.12, r: 0.3, o: 0.4 }] },
  "travel-07.jpg": { sky: ["#c9ecf7", "#8dd5e8", "#3cb5cf", "#1f93b3"], sun: { x: 0.2, y: 0.12, r: 0.03, color: "#ffffff" }, layers: [{ color: "#3fb7c9", base: 0.42, amp: 0.008, freq: 5, blur: 1 }, { color: "#d9c9a2", base: 0.72, amp: 0.04 }, { color: "#a89677", base: 0.88, amp: 0.05, freq: 2.4 }], bokeh: { color: "#ffffff", count: 12, min: 0.003, max: 0.01, y: [0.4, 0.7] } },
  "travel-08.jpg": { sky: ["#b8d8e8", "#e8d8c8", "#f4e6d4"], blobs: [{ color: "#c9d9a0", x: 0.5, y: 0.34, r: 0.17, o: 0.95 }, { color: "#f7efe0", x: 0.58, y: 0.42, r: 0.15, o: 0.95 }, { color: "#ffffff", x: 0.5, y: 0.78, r: 0.2, o: 0.55 }], bokeh: { color: "#ffffff", count: 22, min: 0.012, max: 0.04, y: [0, 0.5] } },
  // --- Omas Geburtstag
  "birthday-01.jpg": { sky: ["#4a2c20", "#8a5238", "#d79a62"], blobs: [{ color: "#fbe9e4", x: 0.5, y: 0.7, r: 0.26, o: 0.95 }, { color: "#e86a85", x: 0.5, y: 0.55, r: 0.2, o: 0.8 }, { color: "#ffd27a", x: 0.43, y: 0.33, r: 0.05, o: 0.95 }, { color: "#ffd27a", x: 0.57, y: 0.33, r: 0.05, o: 0.95 }], bokeh: { color: "#ffd9a0", count: 18, min: 0.01, max: 0.035, y: [0, 0.5] } },
  "birthday-02.jpg": { sky: ["#bfe3f2", "#e9f1d8", "#a8cf8a"], blobs: [{ color: "#f7a8c4", x: 0.35, y: 0.25, r: 0.12, o: 0.9 }, { color: "#a9d6f2", x: 0.55, y: 0.18, r: 0.11, o: 0.9 }, { color: "#fbe58f", x: 0.68, y: 0.3, r: 0.11, o: 0.9 }, { color: "#c9b3ef", x: 0.48, y: 0.38, r: 0.1, o: 0.9 }, { color: "#b8e3c4", x: 0.3, y: 0.42, r: 0.09, o: 0.9 }], layers: [{ color: "#79a85a", base: 0.78, amp: 0.02, blur: 1 }], bokeh: { color: "#fff6c8", count: 16, min: 0.006, max: 0.022, y: [0, 0.35] } },
  "birthday-03.jpg": { sky: ["#fbeed4", "#f4d9b4", "#e7bf94"], rects: [{ color: "#fffdf7", x: 0.04, y: 0.5, w: 0.92, h: 0.3, o: 0.9 }], blobs: [{ color: "#f4a6b8", x: 0.7, y: 0.42, r: 0.09, o: 0.85 }, { color: "#f9f0e6", x: 0.3, y: 0.58, r: 0.07, o: 0.9 }, { color: "#cfe3b4", x: 0.15, y: 0.2, r: 0.2, o: 0.6 }], layers: [{ color: "#6b9a4c", base: 0.12, amp: 0.05, blur: 2 }], bokeh: { color: "#fff3cf", count: 14, min: 0.008, max: 0.025, y: [0, 0.4] } },
  "birthday-04.jpg": { sky: ["#f2dcc8", "#e3bd9e", "#c99a7a"], blobs: [{ color: "#d9b28f", x: 0.38, y: 0.6, r: 0.2, o: 0.9 }, { color: "#cfa583", x: 0.64, y: 0.58, r: 0.18, o: 0.9 }, { color: "#c2413c", x: 0.5, y: 0.45, r: 0.12, o: 0.9 }, { color: "#fff8ec", x: 0.82, y: 0.78, r: 0.1, o: 0.85 }], bokeh: { color: "#fff0d6", count: 10, min: 0.01, max: 0.03 } },
  "birthday-05.jpg": { sky: ["#fbe3b8", "#f6c88e", "#eaa56e"], sun: { x: 0.8, y: 0.28, r: 0.04, color: "#fff2c8" }, layers: [{ color: "#8fb05c", base: 0.52, amp: 0.04, blur: 1 }, { color: "#5f8c3e", base: 0.7, amp: 0.04 }], blobs: [{ color: "#e5587a", x: 0.2, y: 0.62, r: 0.06, o: 0.85 }, { color: "#f08aa4", x: 0.28, y: 0.7, r: 0.05, o: 0.85 }, { color: "#c4324f", x: 0.12, y: 0.74, r: 0.05, o: 0.85 }], bokeh: { color: "#fff0b8", count: 12, min: 0.008, max: 0.025, y: [0, 0.5] } },
  "birthday-06.jpg": { sky: ["#6b4a34", "#a37650", "#d4a672"], rects: [{ color: "#f1e4cc", x: 0.12, y: 0.34, w: 0.76, h: 0.4, o: 0.95 }, { color: "#8a6a50", x: 0.5, y: 0.34, w: 0.01, h: 0.4, o: 0.9 }], blobs: [{ color: "#fff1cf", x: 0.2, y: 0.85, r: 0.1, o: 0.8 }], bokeh: { color: "#ffe4b0", count: 14, min: 0.008, max: 0.03, y: [0, 0.3] } },
  // --- Hochzeit
  "wedding-01.jpg": { sky: ["#f6efe2", "#e9dec8", "#d4c6a8"], blobs: [{ color: "#e8e1cf", x: 0.5, y: 0.7, r: 0.4, o: 0.9 }, { color: "#d7aa3c", x: 0.42, y: 0.52, r: 0.07, o: 0.9 }, { color: "#c9982e", x: 0.58, y: 0.55, r: 0.07, o: 0.9 }, { color: "#9fb59a", x: 0.78, y: 0.4, r: 0.1, o: 0.7 }], bokeh: { color: "#fffaf0", count: 14, min: 0.01, max: 0.04, y: [0, 0.5] } },
  "wedding-02.jpg": { sky: ["#b89a76", "#a07d58", "#7a5a3c"], blobs: [{ color: "#fffdf8", x: 0.45, y: 0.5, r: 0.18, o: 0.95 }, { color: "#f8d9de", x: 0.58, y: 0.55, r: 0.12, o: 0.9 }, { color: "#fffaf0", x: 0.4, y: 0.62, r: 0.12, o: 0.95 }, { color: "#7ea06a", x: 0.62, y: 0.68, r: 0.1, o: 0.8 }, { color: "#6f9560", x: 0.3, y: 0.4, r: 0.08, o: 0.8 }], bokeh: { color: "#f9ecd0", count: 10, min: 0.01, max: 0.04, y: [0, 0.3] } },
  "wedding-03.jpg": { sky: ["#2b3050", "#6b5a7c", "#e3a68a", "#f6d6a4"], layers: [{ color: "#30402c", base: 0.06, amp: 0.04, blur: 2 }, { color: "#2a3626", base: 0.86, amp: 0.02 }], rects: [{ color: "#fffaf0", x: 0.1, y: 0.62, w: 0.8, h: 0.22, o: 0.85 }], bokeh: { color: "#ffe6a8", count: 34, min: 0.005, max: 0.022, y: [0.05, 0.6] } },
  "wedding-04.jpg": { sky: ["#e8dccb", "#d5c2a6", "#a98a66"], blobs: [{ color: "#fffdf8", x: 0.5, y: 0.7, r: 0.22, o: 0.98 }, { color: "#fffdf8", x: 0.5, y: 0.5, r: 0.15, o: 0.98 }, { color: "#fffdf8", x: 0.5, y: 0.34, r: 0.1, o: 0.98 }, { color: "#e9a9b8", x: 0.4, y: 0.5, r: 0.04, o: 0.9 }, { color: "#8fae7c", x: 0.58, y: 0.36, r: 0.04, o: 0.9 }], bokeh: { color: "#fff3d6", count: 12, min: 0.01, max: 0.035 } },
  "wedding-05.jpg": { sky: ["#fbe3b6", "#f4c88c", "#d79a60"], sun: { x: 0.5, y: 0.32, r: 0.05, color: "#fff3c8" }, layers: [{ color: "#8a5a3a", base: 0.28, amp: 0.02, freq: 1, blur: 1 }, { color: "#a7b673", base: 0.7, amp: 0.02, blur: 1 }, { color: "#6f8c4e", base: 0.86, amp: 0.02 }], rects: [{ color: "#fffaf0", x: 0.3, y: 0.55, w: 0.4, h: 0.04, o: 0.8 }, { color: "#f4d4d8", x: 0.38, y: 0.4, w: 0.24, h: 0.14, o: 0.8 }], bokeh: { color: "#fff3c4", count: 12, min: 0.008, max: 0.025, y: [0, 0.4] } },
  "wedding-06.jpg": { sky: ["#241d2e", "#4b3a52", "#8a6a6e"], blobs: [{ color: "#f6e4b8", x: 0.4, y: 0.5, r: 0.07, o: 0.8 }, { color: "#f6e4b8", x: 0.6, y: 0.46, r: 0.07, o: 0.8 }, { color: "#e3a85a", x: 0.5, y: 0.2, r: 0.25, o: 0.3 }], bokeh: { color: "#ffd98a", count: 30, min: 0.01, max: 0.045 } },
  // --- Bruno
  "memorial-01.jpg": { sky: ["#dfe9e6", "#c8dcc0", "#9bbd7a"], layers: [{ color: "#a7c27f", base: 0.52, amp: 0.03, blur: 1 }, { color: "#7ca356", base: 0.68, amp: 0.03 }, { color: "#5c8a40", base: 0.88, amp: 0.025, freq: 3 }], blobs: [{ color: "#d9a85e", x: 0.5, y: 0.7, r: 0.12, o: 0.95 }, { color: "#fff6d0", x: 0.82, y: 0.1, r: 0.2, o: 0.5 }], bokeh: { color: "#f7e9a0", count: 14, min: 0.004, max: 0.014, y: [0.55, 1] } },
  "memorial-02.jpg": { sky: ["#3a3a42", "#6b6258", "#a58b66"], blobs: [{ color: "#fff4d6", x: 0.52, y: 0.38, r: 0.04, o: 0.98 }, { color: "#ffd98a", x: 0.52, y: 0.38, r: 0.22, o: 0.35 }, { color: "#5b3d28", x: 0.3, y: 0.7, r: 0.1, o: 0.9 }, { color: "#8aa3da", x: 0.74, y: 0.72, r: 0.05, o: 0.85 }], bokeh: { color: "#ffe9b8", count: 10, min: 0.01, max: 0.035, y: [0, 0.4] } },
  "memorial-03.jpg": { sky: ["#e8e4d6", "#d8cfae", "#b79b5c"], layers: [{ color: "#a99764", base: 0.4, amp: 0.03, blur: 2 }, { color: "#8a6e3c", base: 0.58, amp: 0.04, blur: 1 }, { color: "#5a4628", base: 0.82, amp: 0.03 }], blobs: [{ color: "#f4efe0", x: 0.5, y: 0.45, r: 0.3, o: 0.55 }], bokeh: { color: "#e3b14a", count: 22, min: 0.006, max: 0.022, y: [0.3, 1] } },
  // --- Gastbeitrag (nicht in PROMPTS.md)
  "birthday-guest-ben.jpg": { sky: ["#ffe9c9", "#ffc7a0", "#f08a7a"], blobs: [{ color: "#ffffff", x: 0.4, y: 0.55, r: 0.2, o: 0.8 }, { color: "#f6b8c8", x: 0.62, y: 0.5, r: 0.13, o: 0.8 }], bokeh: { color: "#fff3cf", count: 18, min: 0.008, max: 0.03 } },
};

async function loadPhoto(file: string, aspects: Record<string, Aspect>, index: number): Promise<{ data: Buffer; source: "fixture" | "placeholder" }> {
  const real = path.join(FIXTURES, file);
  if (fs.existsSync(real)) return { data: fs.readFileSync(real), source: "fixture" };
  const scene = SCENES[file];
  if (!scene) throw new Error(`No placeholder scene defined for ${file}`);
  return { data: await renderPlaceholder(scene, aspects[file] ?? "4:3", 1000 + index * 17), source: "placeholder" };
}

// ------------------------------------------------------------------ main

async function main() {
  if (RESET) {
    console.log(`Resetting ${DATA_DIR}`);
    wipeDataDir();
  }

  // Imported lazily: config() reads the environment on first use.
  const { getAuth } = await import("../src/server/auth/auth");
  const { getDb } = await import("../src/server/container");
  const { COLLECTIONS } = await import("../src/server/ports/document-store");
  const { normalizeAuthUser } = await import("../src/server/repo");
  const albumsSvc = await import("../src/server/services/albums");
  const photosSvc = await import("../src/server/services/photos");
  const inter = await import("../src/server/services/interactions");
  const admin = await import("../src/server/services/admin");
  const themesSvc = await import("../src/server/services/themes");
  const { getBuiltinTheme } = await import("../src/themes/builtin");

  const db = await getDb();
  if ((await db.count(COLLECTIONS.authUser.name)) > 0) {
    console.error(`DATA_DIR (${DATA_DIR}) already contains users. Re-run with --reset to wipe it.`);
    process.exit(1);
  }

  const aspects = readAspects();
  const DAY = 86_400_000;
  const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();

  // ---- users
  console.log("Creating users ...");
  const spec = [
    { key: "admin", email: "admin@wayfare.demo", name: "Alex Admin", role: "admin" },
    { key: "thomas", email: "thomas@wayfare.demo", name: "Thomas", role: "owner" },
    { key: "mia", email: "mia@wayfare.demo", name: "Mia", role: "viewer" },
    { key: "jonas", email: "jonas@wayfare.demo", name: "Jonas", role: "viewer" },
    { key: "erika", email: "oma.erika@wayfare.demo", name: "Erika", role: "viewer" },
    { key: "ben", email: "ben@wayfare.demo", name: "Ben", role: "viewer" },
  ] as const;
  const U = {} as Record<(typeof spec)[number]["key"], SessionUser>;
  const auth = getAuth();
  for (const [i, u] of spec.entries()) {
    const res = (await auth.api.signUpEmail({ body: { email: u.email, password: PASSWORD, name: u.name, locale: "de" } })) as { user: { id: string } };
    await db.update(COLLECTIONS.authUser.name, res.user.id, { role: u.role, emailVerified: true, locale: "de", createdAt: ago(60 - i * 3) });
    const doc = await db.get<Record<string, unknown> & { id: string }>(COLLECTIONS.authUser.name, res.user.id);
    const n = normalizeAuthUser(doc!);
    U[u.key] = { id: n.id, name: n.name, email: n.email, image: null, role: n.role, banned: false };
  }
  const { admin: A, thomas: T, mia: M, jonas: J, erika: E, ben: B } = U;

  // ---- instance settings
  console.log("Instance settings ...");
  await admin.updateInstanceSettings(A, {
    instanceName: "Wayfare Demo",
    onboardingMode: "approval",
    legal: {
      imprint: [
        "# Impressum (Beispiel)",
        "",
        "> **Hinweis:** Dies ist ein Beispieltext für die Demo-Instanz. Betreiber müssen hier ihre eigenen Angaben eintragen.",
        "",
        "**Wayfare Demo – Beispielbetreiber**  ",
        "Musterstraße 1  ",
        "12345 Musterstadt",
        "",
        "E-Mail: kontakt@wayfare.demo",
      ].join("\n"),
      privacy: [
        "# Datenschutzerklärung (Beispiel)",
        "",
        "> **Hinweis:** Beispieltext für die Demo-Instanz – keine Rechtsberatung. Bitte durch eine eigene Erklärung ersetzen.",
        "",
        "## Verantwortlicher",
        "Wayfare Demo – Beispielbetreiber, kontakt@wayfare.demo",
        "",
        "## Welche Daten verarbeiten wir?",
        "- Konto-Daten (Name, E-Mail-Adresse) für die Anmeldung",
        "- Hochgeladene Fotos und Kommentare innerhalb von Alben",
        "- Technisch notwendige Cookies (Anmeldung, Sprache, Album-Freischaltung)",
        "",
        "Es werden keine Tracker und keine externen Schriften oder Dienste eingebunden.",
      ].join("\n"),
    },
  });

  // ---- albums
  type PhotoDef = { file: string; caption?: string };
  interface AlbumDef {
    key: "travel" | "birthday" | "wedding" | "memorial";
    title: string;
    themeId: string;
    message: string;
    photos: PhotoDef[];
    ageDays: number;
  }
  const defs: AlbumDef[] = [
    {
      key: "travel",
      title: "Roadtrip durch die Toskana",
      themeId: "builtin:travel",
      ageDays: 21,
      message:
        "Liebe Familie, liebe Freunde,\n\nzwei Wochen Toskana liegen hinter uns: Zypressen, Pasta, ein winziger Fiat und viel zu viel Gelato. Hier kommen unsere liebsten Momente – viel Spaß beim Stöbern!\n\nHerzliche Grüße\nThomas",
      photos: [
        { file: "travel-01.jpg", caption: "Goldene Stunde auf dem Weg nach San Gimignano" },
        { file: "travel-02.jpg" },
        { file: "travel-03.jpg", caption: "Florenz im letzten Licht" },
        { file: "travel-04.jpg", caption: "Mittagspause mit Aussicht" },
        { file: "travel-05.jpg" },
        { file: "travel-06.jpg" },
        { file: "travel-07.jpg" },
        { file: "travel-08.jpg", caption: "Pistazie & Stracciatella – Pflichtprogramm" },
      ],
    },
    {
      key: "birthday",
      title: "Omas 80. Geburtstag",
      themeId: "builtin:birthday",
      ageDays: 12,
      message:
        "Liebe Familie,\n\nOma Erika ist 80 geworden – und wir haben gefeiert, bis die Kerzen heruntergebrannt waren. Hier sind die schönsten Bilder vom Tag. Wenn ihr eigene Fotos habt, ladet sie gern selbst hoch!\n\nEuer Thomas",
      photos: [
        { file: "birthday-01.jpg", caption: "Die Torte – natürlich selbst gebacken" },
        { file: "birthday-02.jpg" },
        { file: "birthday-03.jpg", caption: "Kaffeetafel im Garten" },
        { file: "birthday-04.jpg", caption: "Der Moment, in dem Oma die Karte las" },
        { file: "birthday-05.jpg" },
        { file: "birthday-06.jpg" },
      ],
    },
    {
      key: "wedding",
      title: "Hochzeit Lena & Jonas",
      themeId: "builtin:wedding",
      ageDays: 30,
      message:
        "Liebe Gäste,\n\nLena und Jonas haben Ja gesagt – und ihr wart dabei! Danke, dass ihr diesen besonderen Tag mit uns geteilt habt. Das Passwort für dieses Album steht auf eurer Einladungskarte.\n\nThomas",
      photos: [
        { file: "wedding-01.jpg", caption: "Zwei Ringe, ein Versprechen" },
        { file: "wedding-02.jpg" },
        { file: "wedding-03.jpg", caption: "Abendstimmung unter den Lichterketten" },
        { file: "wedding-04.jpg" },
        { file: "wedding-05.jpg" },
        { file: "wedding-06.jpg", caption: "Auf die beiden!" },
      ],
    },
    {
      key: "memorial",
      title: "In Erinnerung an Bruno",
      themeId: "builtin:memorial",
      ageDays: 5,
      message:
        "Bruno hat uns 14 Jahre lang begleitet – als Spielkamerad, Seelentröster und bester Freund. Am Sonntag ist er friedlich eingeschlafen.\n\nHier sammeln wir ein paar Bilder und Gedanken. Wer mag, darf gern etwas dazu schreiben.",
      photos: [{ file: "memorial-01.jpg", caption: "Sein Lieblingsplatz auf der Wiese" }, { file: "memorial-02.jpg" }, { file: "memorial-03.jpg", caption: "Unser letzter Herbstspaziergang" }],
    },
  ];

  const albums = {} as Record<AlbumDef["key"], import("../src/domain/types").Album>;
  const photos = {} as Record<string, import("../src/domain/types").Photo[]>;
  let imageIndex = 0;
  let placeholders = 0;
  let fixtures = 0;

  for (const def of defs) {
    console.log(`Album "${def.title}" ...`);
    let album = await albumsSvc.createAlbum(T, { title: def.title, themeId: def.themeId, message: def.message });
    const list: import("../src/domain/types").Photo[] = [];
    for (const p of def.photos) {
      const { data, source } = await loadPhoto(p.file, aspects, imageIndex++);
      if (source === "fixture") fixtures++;
      else placeholders++;
      let photo = await photosSvc.addPhoto(T, album.id, { data, filename: p.file, contentType: "image/jpeg", source: "upload", takenAt: ago(def.ageDays + 3, 0) });
      if (p.caption) photo = await photosSvc.updateCaption(T, photo.id, p.caption);
      list.push(photo);
    }
    photos[def.key] = list;
    // Per-album settings. The wedding album stays in link mode until all interactions are in
    // (the services read the unlock cookie, which does not exist outside a request).
    album = await albumsSvc.updateAlbumSettings(T, album.id, {
      status: "published",
      ...(def.key === "travel" ? { downloadsAllowed: false, watermark: true, watermarkText: "© Thomas · Toskana" } : {}),
      ...(def.key === "birthday" ? { guestUploadsEnabled: true, guestUploadLimit: 5, downloadsAllowed: true } : {}),
      ...(def.key === "wedding" ? { downloadsAllowed: true } : {}),
      ...(def.key === "memorial" ? { commentMode: "pre" as const, downloadsAllowed: false } : {}),
    });
    // Cover: a representative photo (not necessarily the first).
    const coverIdx = { travel: 0, birthday: 0, wedding: 3, memorial: 0 }[def.key];
    await photosSvc.setCoverPhoto(T, album.id, list[coverIdx].id);
    await db.update(COLLECTIONS.albums.name, album.id, { createdAt: ago(def.ageDays), updatedAt: ago(Math.max(def.ageDays - 4, 0)) });
    albums[def.key] = album;
  }

  // ---- interactions
  console.log("Comments, reactions, moderation ...");
  const slug = (k: AlbumDef["key"]) => albums[k].slug;
  const ph = (k: AlbumDef["key"], i: number) => photos[k][i];

  async function comment(actor: SessionUser, p: import("../src/domain/types").Photo, body: string, daysAgo: number, hoursAgo = 0) {
    const c = await inter.addComment(actor, p.id, body);
    await db.update(COLLECTIONS.comments.name, c.id, { createdAt: ago(daysAgo, hoursAgo) });
    return c;
  }
  async function react(actor: SessionUser, p: import("../src/domain/types").Photo, keys: string[]) {
    for (const k of keys) await inter.toggleReaction(actor, p.id, k);
  }

  // Roadtrip
  await comment(M, ph("travel", 0), "Was für ein Ausblick! 😍", 14, 3);
  await comment(J, ph("travel", 0), "Da muss ich auch unbedingt mal hin. Habt ihr einen Tipp für eine Unterkunft?", 13, 20);
  await comment(T, ph("travel", 0), "Klar, ich schick dir den Link! Das Agriturismo war ein Traum.", 13, 18);
  await comment(E, ph("travel", 0), "Wie schön! Grüß mir die Zypressen.", 13, 2);
  await comment(E, ph("travel", 2), "Florenz bei Sonnenuntergang – ein Traum! Da war ich vor 40 Jahren zuletzt.", 13, 9);
  await comment(M, ph("travel", 2), "Die Kuppel im Abendlicht ist einfach magisch ✨", 12, 22);
  await comment(B, ph("travel", 3), "Jetzt hab ich Hunger bekommen 🍝", 12, 5);
  await comment(M, ph("travel", 3), "Das sieht nach einem richtig guten Chianti aus!", 12, 1);
  await comment(J, ph("travel", 4), "Der kleine Fiat ist der Hammer. Hat der die Berge geschafft?", 10, 4);
  await comment(T, ph("travel", 4), "Tapfer – aber im Schneckentempo 😄", 10, 2);
  await comment(E, ph("travel", 7), "Pistazie ist die richtige Wahl!", 9, 6);
  const spam = await comment(B, ph("travel", 7), "Günstige Mietwagen jetzt buchen: www.billig-mietwagen.example – hier klicken!!", 8, 8);
  await inter.reportComment(M, spam.id, "Das sieht nach Werbung aus und hat nichts mit dem Foto zu tun.");
  await react(M, ph("travel", 0), ["dreamy", "love"]);
  await react(J, ph("travel", 0), ["wanderlust", "dreamy"]);
  await react(E, ph("travel", 0), ["love"]);
  await react(B, ph("travel", 0), ["sunny"]);
  await react(M, ph("travel", 2), ["dreamy", "wanderlust"]);
  await react(J, ph("travel", 2), ["love"]);
  await react(E, ph("travel", 2), ["dreamy"]);
  await react(B, ph("travel", 3), ["love"]);
  await react(M, ph("travel", 3), ["sunny"]);
  await react(J, ph("travel", 4), ["sunny", "love"]);
  await react(M, ph("travel", 6), ["sunny", "dreamy"]);
  await react(E, ph("travel", 6), ["dreamy"]);
  await react(B, ph("travel", 6), ["wanderlust"]);
  await react(M, ph("travel", 7), ["love"]);
  await react(J, ph("travel", 7), ["sunny"]);

  // Omas Geburtstag
  await comment(M, ph("birthday", 0), "Die Torte sah unglaublich aus, Oma!", 9, 7);
  await comment(B, ph("birthday", 0), "Bester Kuchen des Jahres. Ich hatte zwei Stücke, nicht verraten 🤫", 9, 5);
  await comment(E, ph("birthday", 0), "Ihr Lieben, ich bin ganz gerührt. Danke für diesen wunderbaren Tag ❤️", 8, 20);
  await comment(M, ph("birthday", 2), "Die Pfingstrosen waren der Hammer!", 8, 12);
  await comment(J, ph("birthday", 3), "Dieser Blick beim Auspacken – unbezahlbar.", 8, 3);
  await comment(T, ph("birthday", 3), "Sie hat die Karte dreimal gelesen 🥹", 8, 1);
  await comment(E, ph("birthday", 5), "Wo habt ihr das alte Album nur wieder gefunden? Was für Erinnerungen!", 7, 9);
  await react(M, ph("birthday", 0), ["cake", "love"]);
  await react(J, ph("birthday", 0), ["cake", "hooray"]);
  await react(E, ph("birthday", 0), ["love"]);
  await react(B, ph("birthday", 0), ["cake", "laugh"]);
  await react(M, ph("birthday", 1), ["party"]);
  await react(J, ph("birthday", 1), ["hooray"]);
  await react(M, ph("birthday", 2), ["love"]);
  await react(E, ph("birthday", 2), ["love", "cake"]);
  await react(B, ph("birthday", 3), ["love"]);
  await react(J, ph("birthday", 3), ["love"]);
  await react(E, ph("birthday", 4), ["party"]);
  // moderation queue of the birthday album: one reported comment, one pending comment, one pending guest photo
  const promo = await comment(B, ph("birthday", 4), "Tolle Fotos! Noch mehr Rabatt-Aktionen unter www.foto-sale.example – jetzt klicken!!", 6, 2);
  await inter.reportComment(E, promo.id, "Das ist Werbung und gehört nicht hierher.");
  await albumsSvc.updateAlbumSettings(T, albums.birthday.id, { commentMode: "pre" });
  await comment(M, ph("birthday", 1), "Die Luftballons waren die beste Idee! Wer hat die aufgehängt?", 0, 6); // stays pending
  await albumsSvc.updateAlbumSettings(T, albums.birthday.id, { commentMode: "post" });
  // pending guest photo from Ben
  const guest = await loadPhoto("birthday-guest-ben.jpg", aspects, 99);
  const guestPhoto = await photosSvc.addGuestPhoto(B, slug("birthday"), { data: guest.data, filename: "IMG_4821.jpg", contentType: "image/jpeg" });
  await db.update(COLLECTIONS.photos.name, guestPhoto.id, { createdAt: ago(1, 4) });

  // Hochzeit (still link mode here)
  await comment(M, ph("wedding", 3), "Die Torte sieht aus wie ein Gemälde!", 25, 5);
  await comment(B, ph("wedding", 2), "Was für ein traumhafter Abend. Danke fürs Teilen, Thomas!", 24, 9);
  await comment(E, ph("wedding", 1), "Der Brautstrauß ist ein Gedicht. So schöne Blumen!", 24, 2);
  await comment(J, ph("wedding", 5), "Auf die beiden! 🥂", 23, 20);
  await react(M, ph("wedding", 3), ["love", "dreamy"]);
  await react(E, ph("wedding", 3), ["love"]);
  await react(B, ph("wedding", 3), ["cheers"]);
  await react(J, ph("wedding", 0), ["ring", "love"]);
  await react(M, ph("wedding", 0), ["ring"]);
  await react(E, ph("wedding", 1), ["love", "dreamy"]);
  await react(M, ph("wedding", 2), ["dreamy"]);
  await react(B, ph("wedding", 5), ["cheers"]);
  await react(J, ph("wedding", 5), ["cheers", "love"]);

  // Bruno (comments pre-moderated)
  const c1 = await comment(M, ph("memorial", 0), "Was für ein wunderschönes Foto. Er sieht so friedlich aus.", 4, 6);
  const c2 = await comment(E, ph("memorial", 0), "Bruno war ein ganz besonderer Hund. Er wird uns allen fehlen.", 4, 3);
  const c3 = await comment(J, ph("memorial", 2), "Danke für 14 Jahre Schwanzwedeln. Mach's gut, alter Freund. 🐾", 3, 20);
  for (const c of [c1, c2, c3]) await inter.moderateComment(T, c.id, "visible");
  await comment(B, ph("memorial", 1), "Ich denke an euch und drück dich ganz fest, Thomas.", 0, 5); // stays pending
  await react(M, ph("memorial", 0), ["white-heart", "candle"]);
  await react(E, ph("memorial", 0), ["candle", "dove"]);
  await react(J, ph("memorial", 0), ["white-heart"]);
  await react(B, ph("memorial", 1), ["candle"]);
  await react(M, ph("memorial", 1), ["candle", "rose"]);
  await react(E, ph("memorial", 2), ["white-heart"]);

  // Wedding: now lock it and set the expiry (+1 year).
  await albumsSvc.updateAlbumSettings(T, albums.wedding.id, {
    accessMode: "password",
    password: WEDDING_PASSWORD,
    expiresAt: new Date(Date.now() + 365 * DAY).toISOString(),
  });

  // ---- owner request, invite, custom theme
  console.log("Owner request, invite, custom theme ...");
  const req = await admin.requestOwnerRole(J, "Hallo! Ich würde gern selbst Alben von unserer Gartenparty und den Fotos vom Vereinsfest teilen.");
  await db.update(COLLECTIONS.ownerRequests.name, req.id, { createdAt: ago(1, 2) });
  await admin.createInvite(A, { email: "tante.birgit@example.com", validDays: 14 });

  const base = getBuiltinTheme("builtin:birthday") as Theme;
  const summer = await themesSvc.saveCustomTheme(T, {
    ...base,
    id: "new",
    name: { de: "Sommerfest", en: "Summer party" },
    baseThemeId: base.id,
    colors: { background: "#fff6dc", surface: "#fffdf4", text: "#33291a", muted: "#6e5b33", accent: "#c4510b", accentContrast: "#ffffff" },
    fonts: { heading: "Quicksand", body: "Nunito" },
    pattern: { kind: "dots", opacity: 0.14 },
    frame: "rounded",
    ornament: "☀️",
    reactions: [
      { key: "sun", emoji: "☀️", label: { de: "Sonne", en: "Sunshine" } },
      { key: "party", emoji: "🎉", label: { de: "Party", en: "Party" } },
      { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
      { key: "cheers", emoji: "🍹", label: { de: "Prost", en: "Cheers" } },
    ],
  });
  await themesSvc.setThemePublic(A, summer.id, true);

  // ---- statistics (views are normally counted per request)
  console.log("Statistics ...");
  const views = { travel: 47, birthday: 31, wedding: 18, memorial: 9 } as const;
  for (const k of Object.keys(views) as (keyof typeof views)[]) {
    await db.update(COLLECTIONS.albums.name, albums[k].id, { "stats.views": views[k], "stats.lastViewedAt": ago(0, k === "memorial" ? 2 : 6) });
    for (const [i, p] of photos[k].entries()) {
      const n = Math.max(1, Math.round((views[k] * (0.9 - i * 0.09)) + ((i * 7) % 5)));
      await db.increment(COLLECTIONS.photos.name, p.id, "views", n);
    }
  }
  // Seeding must not trigger e-mail digests for demo users.
  await db.deleteMany(COLLECTIONS.pendingNotifications.name, {});

  // ---- summary
  const base0 = (process.env.WAYFARE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`\nDone. ${fixtures} fixture photo(s), ${placeholders} generated placeholder(s).`);
  console.log(`\nLogin (password for all: ${PASSWORD})`);
  for (const u of spec) console.log(`  ${u.role.padEnd(6)} ${u.email}`);
  console.log("\nAlbums");
  for (const def of defs) {
    const a = albums[def.key];
    console.log(`  ${def.title.padEnd(30)} ${base0}/a/${a.slug}${def.key === "wedding" ? `   (password: ${WEDDING_PASSWORD})` : ""}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
