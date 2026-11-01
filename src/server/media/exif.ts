/**
 * Minimal EXIF reader: extracts the capture date (DateTimeOriginal, falling back to
 * DateTimeDigitized / DateTime) from the raw EXIF buffer exposed by sharp's metadata().
 * Anything unexpected → null. Never throws.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;

export function parseExifDate(exif: Buffer | undefined | null): string | null {
  try {
    if (!exif || exif.length < 14) return null;
    // sharp returns the EXIF block, usually prefixed with "Exif\0\0" before the TIFF header.
    let base = exif.subarray(0, 4).toString("latin1") === "Exif" ? 6 : 0;
    const order = exif.subarray(base, base + 2).toString("latin1");
    if (order !== "II" && order !== "MM") {
      // Some encoders prefix differently; search for the TIFF header.
      const ii = exif.indexOf(Buffer.from("II*\0", "latin1"));
      const mm = exif.indexOf(Buffer.from("MM\0*", "latin1"));
      const found = ii >= 0 ? ii : mm;
      if (found < 0) return null;
      base = found;
    }
    const le = exif.subarray(base, base + 2).toString("latin1") === "II";
    const u16 = (o: number) => (le ? exif.readUInt16LE(base + o) : exif.readUInt16BE(base + o));
    const u32 = (o: number) => (le ? exif.readUInt32LE(base + o) : exif.readUInt32BE(base + o));
    if (u16(2) !== 42) return null;

    const readIfd = (offset: number): Map<number, { type: number; count: number; valueOffset: number }> => {
      const out = new Map<number, { type: number; count: number; valueOffset: number }>();
      if (offset <= 0 || base + offset + 2 > exif.length) return out;
      const n = Math.min(u16(offset), 512);
      for (let i = 0; i < n; i++) {
        const e = offset + 2 + i * 12;
        if (base + e + 12 > exif.length) break;
        out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valueOffset: e + 8 });
      }
      return out;
    };

    const readAscii = (entry: { type: number; count: number; valueOffset: number } | undefined): string | null => {
      if (!entry || entry.type !== 2 || entry.count < 19) return null;
      const start = entry.count > 4 ? u32(entry.valueOffset) : entry.valueOffset;
      if (base + start + entry.count > exif.length) return null;
      return exif.subarray(base + start, base + start + entry.count).toString("latin1").replace(/\0.*$/, "");
    };

    const ifd0 = readIfd(u32(4));
    const exifPtr = ifd0.get(TAG_EXIF_IFD);
    const exifIfd = exifPtr ? readIfd(u32(exifPtr.valueOffset)) : new Map();
    const raw = readAscii(exifIfd.get(TAG_DATETIME_ORIGINAL)) ?? readAscii(exifIfd.get(TAG_DATETIME_DIGITIZED)) ?? readAscii(ifd0.get(TAG_DATETIME));
    if (!raw) return null;
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    // EXIF timestamps have no zone; we store them as-is (interpreted as UTC) so the wall-clock time is preserved.
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    if (Number.isNaN(date.getTime()) || +y < 1900 || date.getTime() > Date.now() + 86_400_000) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
