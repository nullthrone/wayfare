import QRCode from "qrcode";
import sharp from "sharp";

/** Standard QR quiet zone, in modules. */
export const QUIET_ZONE = 4;

export interface QrMatrix {
  /** Modules per side (without quiet zone). */
  size: number;
  /** True = dark module. */
  at(x: number, y: number): boolean;
}

/** Encodes `text` with error correction level M. */
export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  return { size, at: (x, y) => data[y * size + x] === 1 };
}

/** Horizontal runs of dark modules: [x, y, length]. Used for PDF drawing and SVG paths. */
export function qrRuns(m: QrMatrix): [number, number, number][] {
  const runs: [number, number, number][] = [];
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.at(x, y)) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < m.size && m.at(x + len, y)) len++;
      runs.push([x, y, len]);
      x += len;
    }
  }
  return runs;
}

/** SVG path data (module units, shifted by `offset`) covering all dark modules. */
export function qrPathData(m: QrMatrix, offset = 0): string {
  return qrRuns(m)
    .map(([x, y, len]) => `M${x + offset} ${y + offset}h${len}v1h-${len}z`)
    .join("");
}

export interface QrSvgOptions {
  dark?: string;
  light?: string;
  quiet?: number;
  /** Rendered size in px (width = height). Default: integer multiple of ~512 px. */
  pixels?: number;
}

/** Self-contained QR code SVG (with quiet zone). */
export function qrSvg(text: string, opts: QrSvgOptions = {}): string {
  const m = qrMatrix(text);
  const quiet = opts.quiet ?? QUIET_ZONE;
  const total = m.size + quiet * 2;
  const px = opts.pixels ?? total * Math.max(1, Math.ceil(512 / total));
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#ffffff";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path d="${qrPathData(m, quiet)}" fill="${dark}"/></svg>\n`
  );
}

/** QR code PNG, ≥ `minPixels` wide, exact integer module scale (crisp). */
export async function qrPng(text: string, opts: QrSvgOptions & { minPixels?: number } = {}): Promise<Buffer> {
  const m = qrMatrix(text);
  const quiet = opts.quiet ?? QUIET_ZONE;
  const total = m.size + quiet * 2;
  const scale = Math.max(1, Math.ceil((opts.minPixels ?? 1024) / total));
  const svg = qrSvg(text, { ...opts, pixels: total * scale });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
