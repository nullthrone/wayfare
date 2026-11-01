/**
 * Documentation screenshots (German + English) for docs/public/screenshots/<locale>/<name>.png.
 *
 *   WAYFARE_BASE_URL=http://localhost:3000 npm run screenshots
 *
 * Expects a running app in demo mode that was seeded with `npm run seed` (see e2e/README.md).
 * Uses the `playwright` library directly (no test runner) and `sharp` to shrink the PNGs.
 * Names used by the docs: landing, login, dashboard, album-new, album-photos, album-settings,
 * album-share, album-moderation, album-stats, theme-builder, viewer-cover, viewer-grid,
 * viewer-lightbox, viewer-comments, viewer-password, admin-settings, admin-users, account,
 * viewer-mobile.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const BASE = (process.env.WAYFARE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/public/screenshots");
const PASSWORD = "wayfare-demo";
const WEDDING_PASSWORD = "lena-jonas";
const MAX_BYTES = 400 * 1024;
const LOCALES = (process.env.WAYFARE_SCREENSHOT_LOCALES || "de,en").split(",");
const ONLY = process.env.WAYFARE_SCREENSHOT_ONLY ? new Set(process.env.WAYFARE_SCREENSHOT_ONLY.split(",")) : null;

const DESKTOP = { width: 1440, height: 900 };
const TEXT = {
  de: { newTitle: "Sommerfest im Garten", newMessage: "Liebe Nachbarn und Freunde, danke für den schönen Nachmittag! Hier sind die Fotos vom Fest.", draft: "Wunderschön – da will ich auch hin! 😍" },
  en: { newTitle: "Garden summer party", newMessage: "Dear neighbours and friends, thanks for a lovely afternoon! Here are the photos from the party.", draft: "Beautiful – I want to go there too! 😍" },
};

const log = (...a) => console.log(...a);

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`App at ${BASE} is not healthy. Start it with 'npm start' (after 'npm run build' and 'npm run seed').`);
}

/** Scrolls through the page (triggers lazy images), waits for network, fonts and all images. */
async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight - 100);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && (i.naturalWidth > 0 || !i.currentSrc)), null, { timeout: 20000 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
}

async function save(page, locale, name, opts = {}) {
  if (ONLY && !ONLY.has(name)) return;
  const dir = path.join(OUT, locale);
  fs.mkdirSync(dir, { recursive: true });
  const { fullPage = false, maxHeight = 1700, dpr = 1 } = opts;
  let shot;
  if (fullPage) {
    await page.evaluate(() => window.scrollTo(0, 0));
    // Resize the viewport to the page height instead of using Playwright's fullPage stitching, so
    // sticky/fixed bars (site header, "save" bar) end up where a user would see them.
    const vp = page.viewportSize();
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h, vp.height), maxHeight) });
    await page.waitForTimeout(400);
    await page.mouse.move(0, 0);
    shot = await page.screenshot({ type: "png" });
    await page.setViewportSize(vp);
  } else {
    shot = await page.screenshot({ type: "png" });
  }
  let buf = await sharp(shot).png({ compressionLevel: 9, palette: false, adaptiveFiltering: true }).toBuffer();
  let mode = "lossless";
  if (buf.length > MAX_BYTES) {
    // Photo-heavy pages: fall back to a 256-colour palette with dithering (visually near-identical).
    buf = await sharp(shot).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10, colours: 256, dither: 1 }).toBuffer();
    mode = "palette";
  }
  fs.writeFileSync(path.join(dir, `${name}.png`), buf);
  log(`  ${locale}/${name}.png  ${(buf.length / 1024).toFixed(0)} KB (${mode}${dpr > 1 ? `, @${dpr}x` : ""})`);
}

async function go(page, url) {
  const res = await page.goto(url.startsWith("http") ? url : BASE + url, { waitUntil: "domcontentloaded" });
  if (res && res.status() >= 400) throw new Error(`${url} -> HTTP ${res.status()}`);
  await settle(page);
}

async function loginViaForm(browser, email) {
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addCookies([{ name: "wf_locale", value: "de", url: BASE }]);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle"); // wait for hydration, otherwise the form submits natively
  const form = page.getByTestId("login-password");
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="password"]').fill(PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), form.locator('button[type="submit"]').click()]);
  const state = await context.storageState();
  await context.close();
  return state;
}

async function main() {
  await waitForApp();
  const browser = await chromium.launch();
  const failures = [];
  try {
    log("Signing in demo users ...");
    const states = {};
    for (const [key, email] of Object.entries({ thomas: "thomas@wayfare.demo", admin: "admin@wayfare.demo", mia: "mia@wayfare.demo" })) {
      states[key] = await loginViaForm(browser, email);
    }

    const ctx = async (locale, who, extra = {}) => {
      const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, ...(who ? { storageState: states[who] } : {}), ...extra });
      await context.addCookies([{ name: "wf_locale", value: locale, url: BASE }]);
      context.setDefaultTimeout(20000);
      return context;
    };
    const step = async (label, fn) => {
      try {
        await fn();
      } catch (err) {
        failures.push(`${label}: ${err.message}`);
        console.error(`  FAILED ${label}: ${err.message}`);
      }
    };

    // Resolve album ids / slugs once, via the UI (owner dashboard).
    const albums = {};
    {
      const c = await ctx("de", "thomas");
      const page = await c.newPage();
      await go(page, "/dashboard");
      const cards = await page.getByTestId("album-card").evaluateAll((els) =>
        els.map((el) => ({ text: el.textContent || "", href: (el.matches("a") ? el : el.querySelector("a[href^='/dashboard/albums/']"))?.getAttribute("href") || "" })),
      );
      const find = (needle) => {
        const c = cards.find((x) => x.text.includes(needle));
        if (!c?.href) throw new Error(`Album card "${needle}" not found on the dashboard – did you run 'npm run seed'?`);
        return c.href.split("/").pop();
      };
      albums.travel = { id: find("Toskana") };
      albums.birthday = { id: find("Omas 80") };
      albums.wedding = { id: find("Lena & Jonas") };
      albums.memorial = { id: find("Bruno") };
      for (const a of Object.values(albums)) {
        await go(page, `/dashboard/albums/${a.id}?tab=share`);
        a.slug = await page.evaluate(() => (document.body.innerText.match(/\/a\/([a-z0-9]{10})/) || [])[1]);
        if (!a.slug) {
          // fall back to the "view album" link
          a.slug = (await page.getByTestId("view-album").getAttribute("href")).split("/").pop();
        }
      }
      await c.close();
    }
    log(`Albums: ${Object.entries(albums).map(([k, v]) => `${k}=${v.slug}`).join(", ")}`);

    for (const locale of LOCALES) {
      log(`\n== ${locale} ==`);
      const tx = TEXT[locale];

      // ---- logged out
      await step("guest pages", async () => {
        const c = await ctx(locale, null);
        const page = await c.newPage();
        await go(page, "/");
        await save(page, locale, "landing", { fullPage: true, maxHeight: 1700 });
        await go(page, "/login");
        await save(page, locale, "login", { fullPage: true });
        await go(page, `/a/${albums.wedding.slug}`);
        await page.getByTestId("password-gate").waitFor();
        await page.getByTestId("gate-password").fill(WEDDING_PASSWORD);
        await page.mouse.move(0, 0);
        await save(page, locale, "viewer-password");
        await c.close();
      });

      // ---- owner (Thomas)
      await step("owner pages", async () => {
        const c = await ctx(locale, "thomas");
        const page = await c.newPage();
        await go(page, "/dashboard");
        await save(page, locale, "dashboard", { fullPage: true, maxHeight: 1100 });

        await go(page, "/dashboard/albums/new");
        await page.locator('input[name="title"]').fill(tx.newTitle);
        await page.locator('textarea[name="message"]').fill(tx.newMessage);
        await page.getByTestId("theme-picker").locator("label").filter({ hasText: /Sommer|Summer/ }).first().click().catch(() => {});
        await page.mouse.move(0, 0);
        await save(page, locale, "album-new", { fullPage: true, maxHeight: 1500 });

        const a = albums.birthday.id;
        await go(page, `/dashboard/albums/${a}`);
        await save(page, locale, "album-photos", { fullPage: true, maxHeight: 1400 });
        await go(page, `/dashboard/albums/${albums.travel.id}?tab=settings`);
        await save(page, locale, "album-settings", { fullPage: true, maxHeight: 1700 });
        await go(page, `/dashboard/albums/${albums.travel.id}?tab=share`);
        await save(page, locale, "album-share", { fullPage: true, maxHeight: 1500 });
        await go(page, `/dashboard/albums/${a}?tab=moderation`);
        await save(page, locale, "album-moderation", { fullPage: true, maxHeight: 1500 });
        await go(page, `/dashboard/albums/${albums.travel.id}?tab=stats`);
        await save(page, locale, "album-stats", { fullPage: true, maxHeight: 1400 });

        await go(page, "/dashboard/themes");
        const edit = await page.locator('a[href^="/dashboard/themes/"]:not([href$="/new"])').first().getAttribute("href");
        await go(page, edit);
        await save(page, locale, "theme-builder", { fullPage: true, maxHeight: 1500 });

        await go(page, "/account");
        await save(page, locale, "account", { fullPage: true, maxHeight: 1300 });
        await c.close();
      });

      // ---- guest in the viewer (Mia, a signed-in viewer)
      await step("viewer pages", async () => {
        const c = await ctx(locale, "mia");
        const page = await c.newPage();
        await go(page, `/a/${albums.travel.slug}`);
        await save(page, locale, "viewer-cover");

        await page.getByTestId("photo-gallery").scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const el = document.querySelector('[data-testid="photo-gallery"]');
          window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100);
        });
        await page.waitForTimeout(300);
        await save(page, locale, "viewer-grid");

        const openTile = async (i) => {
          await page.getByTestId("photo-tile").nth(i).click();
          await page.getByTestId("lightbox").waitFor({ state: "visible" });
          await page.waitForFunction(() => {
            const img = document.querySelector('[data-testid="lightbox-image"]');
            return img && img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === "1";
          });
          await page.getByTestId("reaction-bar").waitFor();
          await page.mouse.move(0, 0);
          await page.waitForTimeout(300);
        };
        await openTile(2);
        await save(page, locale, "viewer-lightbox");
        await page.keyboard.press("Escape");
        await page.getByTestId("lightbox").waitFor({ state: "hidden" });

        await openTile(0);
        await page.getByTestId("comment").first().waitFor();
        await page.getByTestId("comment-input").fill(tx.draft);
        await page.mouse.move(0, 0);
        await save(page, locale, "viewer-comments");
        await c.close();

        // Mobile (travel album, cover + first photos)
        const m = await ctx(locale, "mia", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        const mp = await m.newPage();
        await go(mp, `/a/${albums.travel.slug}`);
        await save(mp, locale, "viewer-mobile", { dpr: 2 });
        await m.close();
      });

      // ---- admin
      await step("admin pages", async () => {
        const c = await ctx(locale, "admin");
        const page = await c.newPage();
        await go(page, "/admin/settings");
        await save(page, locale, "admin-settings", { fullPage: true, maxHeight: 1500 });
        await go(page, "/admin/users");
        await save(page, locale, "admin-users", { fullPage: true, maxHeight: 1200 });
        await c.close();
      });
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} step(s) failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
