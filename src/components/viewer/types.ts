import type { ThemeReaction } from "@/domain/theme";
import type { CommentMode } from "@/domain/types";

/** Serialisable photo model passed from the server page to the client gallery. */
export interface ViewerPhoto {
  id: string;
  width: number;
  height: number;
  color: string;
  caption: string;
  thumb: string;
  display: string;
  /** Only set when the owner allows downloads. NEVER populated otherwise. */
  original: string | null;
  reactions: Record<string, number>;
  commentCount: number;
  /** Reaction keys the current user has set. */
  mine: string[];
}

export interface ViewerConfig {
  slug: string;
  /** True when downloads are disabled → apply download protection. */
  protect: boolean;
  downloads: boolean;
  reactionsEnabled: boolean;
  reactions: ThemeReaction[];
  commentMode: CommentMode;
  guestUploads: boolean;
  viewer: { id: string; name: string } | null;
  /** Album owner / admin (may delete any comment). */
  isOwner: boolean;
  loginHref: string;
  locale: "de" | "en";
}

export interface ViewerComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  status: "visible" | "pending" | "hidden";
  createdAt: string;
}
