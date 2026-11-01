/**
 * DocumentStore port — the single persistence abstraction of Wayfare.
 *
 * Implementations:
 *  - SQLite  (src/server/adapters/db/sqlite.ts)    — one table per collection, JSON column + expression indexes
 *  - Firestore (src/server/adapters/db/firestore.ts) — one Firestore collection per collection
 *
 * Both domain repositories and the Better Auth adapter are built on top of this port,
 * so there is exactly ONE persistence contract to keep consistent across runtimes.
 * See docs/adr/0001-document-store-port.md.
 *
 * Semantics every implementation MUST honour (verified by tests/contract/document-store.test.ts):
 *  - Documents are plain JSON objects with a string `id` field.
 *  - `field` paths may be nested with dots ("access.mode") for filtering and increments.
 *  - Filters combine with AND unless `connector: "OR"` is given on a filter, in which case
 *    the expression is evaluated as (AND-group-of-preceding) OR filter … — implementations may
 *    simply evaluate OR-filters in memory. Keep OR usage rare (Better Auth uses it occasionally).
 *  - `sort` and `limit`/`offset` are applied after filtering. Implementations MAY sort in memory
 *    (Firestore does when filters are present, to avoid composite-index requirements).
 *  - Missing fields never match a filter except `ne` / `not_in`.
 */

export type FilterOp =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "not_in"
  | "contains" // string contains substring, or array contains value
  | "starts_with"
  | "ends_with";

export interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
  connector?: "AND" | "OR";
}

export interface QueryOptions {
  where?: Filter[];
  sort?: { field: string; direction: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

export type Doc = { id: string } & Record<string, unknown>;

export interface DocumentStore {
  get<T extends Doc>(collection: string, id: string): Promise<T | null>;
  /** Fails if a document with the same id exists. */
  create<T extends Doc>(collection: string, doc: T): Promise<T>;
  /** Insert or fully replace. */
  put<T extends Doc>(collection: string, doc: T): Promise<T>;
  /** Shallow-merge top-level keys (dot-paths allowed, e.g. {"access.mode": "link"}). Returns updated doc or null if missing. */
  update<T extends Doc>(collection: string, id: string, patch: Record<string, unknown>): Promise<T | null>;
  /** Atomically add `by` to a numeric field (dot-path allowed). Missing field counts as 0. No-op if doc missing. */
  increment(collection: string, id: string, field: string, by: number): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  find<T extends Doc>(collection: string, query?: QueryOptions): Promise<T[]>;
  findOne<T extends Doc>(collection: string, query?: QueryOptions): Promise<T | null>;
  count(collection: string, query?: QueryOptions): Promise<number>;
  /** Patch all matching docs, returns number affected. */
  updateMany(collection: string, query: QueryOptions, patch: Record<string, unknown>): Promise<number>;
  /** Delete all matching docs, returns number affected. */
  deleteMany(collection: string, query: QueryOptions): Promise<number>;
}

/** Collections + fields that should be indexed (SQLite creates expression indexes; Firestore auto-indexes single fields). */
export const COLLECTIONS = {
  albums: { name: "albums", indexes: ["ownerId", "slug"] },
  photos: { name: "photos", indexes: ["albumId", "uploadedBy", "status"] },
  comments: { name: "comments", indexes: ["photoId", "albumId", "status"] },
  reactions: { name: "reactions", indexes: ["photoId", "albumId", "userId"] },
  reports: { name: "reports", indexes: ["albumId", "ownerId"] },
  themes: { name: "themes", indexes: ["ownerId", "isPublic"] },
  settings: { name: "settings", indexes: [] },
  invites: { name: "invites", indexes: ["token"] },
  ownerRequests: { name: "owner_requests", indexes: ["userId", "status"] },
  connections: { name: "connections", indexes: ["userId"] },
  pendingNotifications: { name: "pending_notifications", indexes: ["ownerId"] },
  viewMarkers: { name: "view_markers", indexes: ["albumId"] },
  // Better Auth models (names chosen by Better Auth, prefixed to avoid clashes)
  authUser: { name: "auth_user", indexes: ["email"] },
  authSession: { name: "auth_session", indexes: ["token", "userId"] },
  authAccount: { name: "auth_account", indexes: ["userId", "accountId"] },
  authVerification: { name: "auth_verification", indexes: ["identifier"] },
  authPasskey: { name: "auth_passkey", indexes: ["userId", "credentialID"] },
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;
export const col = (k: CollectionKey) => COLLECTIONS[k].name;
