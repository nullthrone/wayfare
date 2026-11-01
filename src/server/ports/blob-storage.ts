/**
 * BlobStorage port. Keys are POSIX-like paths without leading slash,
 * e.g. `albums/{albumId}/{photoId}/display.webp`.
 *
 * Implementations: local filesystem, S3-compatible (AWS, MinIO, R2, …), Firebase Storage.
 * Media is ALWAYS served through Wayfare's own route (/api/media/...) — never via public
 * bucket URLs — so access control and download protection are enforced uniformly.
 */
export interface BlobStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Returns null if the object does not exist. */
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Delete every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}
