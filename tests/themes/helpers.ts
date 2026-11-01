import sharp from "sharp";
import type { Album } from "@/domain/types";

export function fakeAlbum(over: Partial<Album> = {}): Album {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "alb1",
    ownerId: "u1",
    slug: "abc23defg4",
    title: "Omas 80. Geburtstag – Größe & Äpfel 🎂",
    message: "Liebe Familie, danke für den wunderbaren Tag! Hier sind unsere schönsten Momente vom Fest. 🎉\n\nEuer Thomas",
    status: "published",
    themeId: "builtin:birthday",
    coverPhotoId: null,
    access: { mode: "link", passwordHash: null, passwordVersion: 0 },
    expiresAt: null,
    downloads: { allowed: false, watermark: false, watermarkText: "" },
    comments: { mode: "post" },
    reactions: { enabled: true },
    guestUploads: { enabled: false, limitPerGuest: 10 },
    notifications: { mode: "off" },
    blockedUserIds: [],
    stats: { views: 0, lastViewedAt: null },
    photoCount: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** A small gradient JPEG standing in for a cover photo. */
export async function fakeCover(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}
