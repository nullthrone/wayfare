import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES, getBuiltinTheme } from "@/themes/builtin";
import { EXPORT_FORMATS, renderExport, type ExportContext } from "@/server/exports";
import { qrMatrix } from "@/server/exports/qr";
import { fakeAlbum, fakeCover } from "./helpers";

const url = "http://localhost:3000/a/abc23defg4";
const birthday = getBuiltinTheme("builtin:birthday")!;

function ctx(over: Partial<ExportContext> = {}): ExportContext {
  return { album: fakeAlbum(), theme: birthday, url, cover: null, locale: "de", options: {}, ...over };
}

async function pdfInfo(data: Buffer) {
  expect(data.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const doc = await PDFDocument.load(data);
  return doc;
}

describe("renderExport", () => {
  it("postcard-a6: 2 pages, 111x154 mm media box, trim box 105x148", async () => {
    const r = await renderExport("postcard-a6", ctx());
    expect(r.contentType).toBe("application/pdf");
    expect(r.filename).toBe("wayfare-abc23defg4-postcard-a6.pdf");
    const doc = await pdfInfo(r.data);
    expect(doc.getPageCount()).toBe(2);
    const p = doc.getPage(0);
    expect(p.getWidth()).toBeCloseTo((111 * 72) / 25.4, 1);
    expect(p.getHeight()).toBeCloseTo((154 * 72) / 25.4, 1);
    expect(p.getTrimBox().width).toBeCloseTo((105 * 72) / 25.4, 1);
    expect(p.getTrimBox().height).toBeCloseTo((148 * 72) / 25.4, 1);
  });

  it("postcard with cover, english, password hint, long message", async () => {
    const r = await renderExport(
      "postcard-a6",
      ctx({
        cover: await fakeCover(),
        locale: "en",
        album: fakeAlbum({ message: "word ".repeat(400), access: { mode: "password", passwordHash: "x", passwordVersion: 1 } }),
        options: { showPasswordHint: true },
      }),
    );
    const doc = await pdfInfo(r.data);
    expect(doc.getPageCount()).toBe(2);
    expect(r.data.length).toBeGreaterThan(5000); // embedded JPEG
  });

  it("postcard survives an undecodable cover", async () => {
    const r = await renderExport("postcard-a6", ctx({ cover: Buffer.from("not an image") }));
    expect((await pdfInfo(r.data)).getPageCount()).toBe(2);
  });

  it.each(["round", "square"] as const)("stickers (%s): one A4 page", async (shape) => {
    const r = await renderExport("stickers", ctx({ options: { shape } }));
    expect(r.filename).toBe(`wayfare-abc23defg4-stickers-${shape}.pdf`);
    const doc = await pdfInfo(r.data);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((210 * 72) / 25.4, 1);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((297 * 72) / 25.4, 1);
  });

  it.each([
    ["poster-a4", 210, 297],
    ["poster-a3", 297, 420],
  ] as const)("%s has the right page size", async (format, w, h) => {
    const r = await renderExport(format, ctx({ locale: "en" }));
    const doc = await pdfInfo(r.data);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo((w * 72) / 25.4, 0);
    expect(doc.getPage(0).getHeight()).toBeCloseTo((h * 72) / 25.4, 0);
  });

  it.each([
    ["social-story", 1080, 1920],
    ["social-square", 1080, 1080],
  ] as const)("%s PNG has the right pixel size", async (format, w, h) => {
    const r = await renderExport(format, ctx({ options: { type: "png" } }));
    expect(r.contentType).toBe("image/png");
    expect(r.filename.endsWith(".png")).toBe(true);
    const meta = await sharp(r.data).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(w);
    expect(meta.height).toBe(h);
  });

  it("social SVG is XML with the QR path and escapes text", async () => {
    const r = await renderExport("social-square", ctx({ options: { type: "svg" }, album: fakeAlbum({ title: "Tom & <Jerry>" }) }));
    const svg = r.data.toString("utf8");
    expect(r.contentType).toBe("image/svg+xml");
    expect(svg).toContain("Tom &amp; &lt;Jerry&gt;");
    expect(svg).not.toContain("<Jerry>");
    expect(svg).toContain("localhost:3000/a/abc23defg4");
    await sharp(r.data).metadata(); // parseable
  });

  it("qr-svg / qr-png", async () => {
    const svg = await renderExport("qr-svg", ctx());
    expect(svg.data.toString()).toMatch(/^<svg /);
    const png = await renderExport("qr-png", ctx());
    const meta = await sharp(png.data).metadata();
    expect(meta.width).toBe(meta.height);
    expect(meta.width!).toBeGreaterThanOrEqual(1024);
    expect(qrMatrix(url).size).toBeGreaterThanOrEqual(21);
  });

  it("every format renders for every built-in theme", async () => {
    for (const theme of BUILTIN_THEMES) {
      for (const format of EXPORT_FORMATS) {
        const r = await renderExport(format, ctx({ theme, options: { type: "png" } }));
        expect(r.data.length).toBeGreaterThan(100);
      }
    }
  }, 60_000);
});
