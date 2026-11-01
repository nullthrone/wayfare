/**
 * Wayfare domain model.
 *
 * All entities are stored as JSON documents through the DocumentStore port
 * (src/server/ports/document-store.ts). Design rule: every access pattern must be
 * expressible as "filter by equality/range on top-level fields, optional sort,
 * optional limit" — the lowest common denominator of SQLite-JSON and Firestore.
 * No joins. Denormalise where needed (e.g. comment.authorName).
 *
 * Timestamps are ISO-8601 strings (UTC). IDs are nanoid strings.
 */

export type Role = "admin" | "owner" | "viewer";

/** Projection of the Better Auth user record that the app works with. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: Role;
  /** Set when an admin blocked this user instance-wide. */
  banned?: boolean;
}

export type AccessMode = "link" | "password";
export type CommentMode = "post" | "pre" | "off";
export type NotifyMode = "off" | "instant" | "daily";
export type AlbumStatus = "draft" | "published";

export interface Album {
  id: string;
  ownerId: string;
  /** Public share identifier used in the QR URL: /a/{slug}. Rotating it revokes all QR codes. */
  slug: string;
  title: string;
  /** Greeting text shown on the album cover and printed on the postcard back. Plain text. */
  message: string;
  status: AlbumStatus;
  themeId: string;
  coverPhotoId: string | null;

  access: {
    mode: AccessMode;
    /** scrypt hash `scrypt$N$r$p$saltB64$hashB64`; null when mode = "link". */
    passwordHash: string | null;
    /** Incremented on every password change; embedded in unlock cookies to invalidate them. */
    passwordVersion: number;
  };
  /** ISO date; after this the album is inaccessible to viewers. null = never expires. */
  expiresAt: string | null;

  downloads: {
    allowed: boolean;
    /** Only effective when allowed = false. */
    watermark: boolean;
    /** Defaults to album title when empty. */
    watermarkText: string;
  };

  comments: { mode: CommentMode };
  reactions: { enabled: boolean };

  guestUploads: {
    enabled: boolean;
    /** Max photos per guest per album. */
    limitPerGuest: number;
  };

  notifications: { mode: NotifyMode };

  /** User IDs blocked from interacting with this album (comments, reactions, uploads). */
  blockedUserIds: string[];

  stats: {
    views: number;
    lastViewedAt: string | null;
  };

  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PhotoStatus = "approved" | "pending" | "rejected";
export type PhotoSourceId = "upload" | "guest-upload" | "google-photos" | "google-drive";

/** Derivative variants stored in blob storage. */
export type PhotoVariant = "thumb" | "display" | "original";

export interface Photo {
  id: string;
  albumId: string;
  /** Album owner (denormalised for authorisation without a second read). */
  ownerId: string;
  uploadedBy: string;
  uploaderName: string;
  source: PhotoSourceId;
  /** Opaque id in the source system (dedupe on re-import). */
  sourceRef: string | null;
  status: PhotoStatus;
  caption: string;
  /** Sort key within the album (ascending). */
  position: number;
  width: number;
  height: number;
  /** Dominant colour as #rrggbb, used as placeholder while loading. */
  dominantColor: string;
  takenAt: string | null;
  contentType: string;
  originalFilename: string;
  /** Blob storage keys per variant. */
  blobKeys: Record<PhotoVariant, string>;
  bytes: number;
  /** Reaction counters keyed by reaction key (see ThemeReaction.key). */
  reactionCounts: Record<string, number>;
  commentCount: number;
  views: number;
  createdAt: string;
}

export type CommentStatus = "visible" | "pending" | "hidden";

export interface Comment {
  id: string;
  albumId: string;
  photoId: string;
  ownerId: string;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  status: CommentStatus;
  reportCount: number;
  createdAt: string;
}

/** One document per (photo, user, reaction key). id = `${photoId}_${userId}_${key}`. */
export interface Reaction {
  id: string;
  albumId: string;
  photoId: string;
  userId: string;
  key: string;
  createdAt: string;
}

export interface Report {
  id: string;
  albumId: string;
  ownerId: string;
  commentId: string;
  reporterId: string;
  reason: string;
  resolved: boolean;
  createdAt: string;
}

export type OnboardingMode = "open" | "approval" | "invite";

export interface InstanceSettings {
  id: "instance";
  instanceName: string;
  onboardingMode: OnboardingMode;
  /** Markdown, rendered sanitised. Empty = page hidden from footer. */
  legal: { imprint: string; privacy: string };
  /** Max upload size per photo in MB. */
  maxUploadMb: number;
  /** Max photos per album (0 = unlimited). */
  maxPhotosPerAlbum: number;
  updatedAt: string;
}

export interface Invite {
  id: string;
  /** Random token used in /invite/{token}. */
  token: string;
  createdBy: string;
  /** Optional e-mail the invite was sent to (informational). */
  email: string | null;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export type OwnerRequestStatus = "pending" | "approved" | "denied";

export interface OwnerRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  message: string;
  status: OwnerRequestStatus;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** OAuth connection of an owner to a photo source (tokens encrypted at rest). */
export interface SourceConnection {
  id: string; // `${userId}_${sourceId}`
  userId: string;
  sourceId: Exclude<PhotoSourceId, "upload" | "guest-upload">;
  accountEmail: string | null;
  /** AES-256-GCM encrypted JSON of OAuthTokens, see src/server/crypto.ts */
  tokensEnc: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

/** Pending notification for daily digests. */
export interface PendingNotification {
  id: string;
  ownerId: string;
  albumId: string;
  albumTitle: string;
  kind: "comment" | "guest-upload" | "report";
  summary: string;
  createdAt: string;
}

/** Deduplicates album view counting per visitor/day without storing IPs. */
export interface ViewMarker {
  id: string; // `${albumId}_${visitorHash}_${yyyy-mm-dd}`
  albumId: string;
  createdAt: string;
}
