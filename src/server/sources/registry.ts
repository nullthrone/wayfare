import "server-only";
import type { CloudSourceId, PhotoSourceAdapter } from "../ports/photo-source";
import { notFound } from "../errors";
import { googleDriveAdapter } from "./google-drive";
import { googlePhotosAdapter } from "./google-photos";

/** Add new sources here (implement PhotoSourceAdapter in src/server/sources/<id>.ts). */
const adapters: Record<CloudSourceId, PhotoSourceAdapter> = {
  "google-photos": googlePhotosAdapter,
  "google-drive": googleDriveAdapter,
};

export function listAdapters(): PhotoSourceAdapter[] {
  return Object.values(adapters);
}

export function isCloudSourceId(id: string): id is CloudSourceId {
  return Object.prototype.hasOwnProperty.call(adapters, id);
}

/** Throws NotFound for unknown ids. */
export function getSource(id: string): PhotoSourceAdapter {
  if (!isCloudSourceId(id)) throw notFound("sourceNotFound");
  return adapters[id];
}
