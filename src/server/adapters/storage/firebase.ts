import "server-only";
import { getStorage } from "firebase-admin/storage";
import { config } from "../../config";
import type { BlobStorage } from "../../ports/blob-storage";
import { getFirebaseApp } from "../firebase-app";
import { assertSafeKey } from "./keys";

/** Firebase Storage (GCS bucket) BlobStorage via firebase-admin. Bucket: FIREBASE_STORAGE_BUCKET. */
export function createFirebaseStorage(): BlobStorage {
  const name = config().FIREBASE_STORAGE_BUCKET;
  if (!name) throw new Error("FIREBASE_STORAGE_BUCKET is required when STORAGE_DRIVER=firebase");
  const bucket = () => getStorage(getFirebaseApp()).bucket(name);
  const isMissing = (e: unknown) => (e as { code?: number }).code === 404;

  return {
    async put(key, data, contentType) {
      assertSafeKey(key);
      await bucket().file(key).save(data, { contentType, resumable: false });
    },

    async get(key) {
      assertSafeKey(key);
      const file = bucket().file(key);
      try {
        const [[data], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
        return { data, contentType: meta.contentType ?? "application/octet-stream" };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },

    async exists(key) {
      assertSafeKey(key);
      const [exists] = await bucket().file(key).exists();
      return exists;
    },

    async delete(key) {
      assertSafeKey(key);
      await bucket().file(key).delete({ ignoreNotFound: true });
    },

    async deletePrefix(prefix) {
      assertSafeKey(prefix, "prefix");
      await bucket().deleteFiles({ prefix, force: true });
    },
  };
}
