import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "../../config";
import type { BlobStorage } from "../../ports/blob-storage";
import { assertSafeKey } from "./keys";

/** S3-compatible BlobStorage (AWS S3, MinIO, Cloudflare R2, …) configured through S3_* env keys. */
export function createS3Storage(): BlobStorage {
  const cfg = config();
  if (!cfg.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  const Bucket = cfg.S3_BUCKET;
  const client = new S3Client({
    region: cfg.S3_REGION,
    endpoint: cfg.S3_ENDPOINT,
    forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    ...(cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
      ? { credentials: { accessKeyId: cfg.S3_ACCESS_KEY_ID, secretAccessKey: cfg.S3_SECRET_ACCESS_KEY } }
      : {}),
  });

  const isMissing = (e: unknown) => {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    return err.name === "NoSuchKey" || err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
  };

  return {
    async put(key, data, contentType) {
      assertSafeKey(key);
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: contentType, ContentLength: data.length }));
    },

    async get(key) {
      assertSafeKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!res.Body) return null;
        return { data: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType ?? "application/octet-stream" };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },

    async exists(key) {
      assertSafeKey(key);
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (e) {
        if (isMissing(e)) return false;
        throw e;
      }
    },

    async delete(key) {
      assertSafeKey(key);
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async deletePrefix(prefix) {
      assertSafeKey(prefix, "prefix");
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }));
        const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (objects.length > 0) {
          const res = await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects, Quiet: true } }));
          if (res.Errors && res.Errors.length > 0) {
            throw new Error(`S3 deletePrefix failed for ${res.Errors.length} objects: ${res.Errors[0].Message ?? res.Errors[0].Code}`);
          }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
  };
}
