import "server-only";
import { config } from "./config";
import type { DocumentStore } from "./ports/document-store";
import type { BlobStorage } from "./ports/blob-storage";
import type { Mailer } from "./ports/mailer";

/**
 * Composition root: selects adapters based on configuration.
 * The ONLY place that knows which concrete adapter is in use.
 *
 *            | selfhost                 | firebase
 *  ----------+--------------------------+-------------------------
 *  db        | SQLite (DATA_DIR)        | Firestore
 *  storage   | local FS or S3           | Firebase Storage (or S3)
 *  mail      | SMTP or console          | SMTP or console
 *
 * Adapters are loaded lazily via dynamic import so the firebase-admin SDK is never
 * loaded in a self-hosted deployment and vice versa.
 */

type Container = { db: DocumentStore; blobs: BlobStorage; mailer: Mailer };

const g = globalThis as unknown as { __wayfareContainer?: Promise<Container> };

async function build(): Promise<Container> {
  const cfg = config();

  const db: DocumentStore =
    cfg.WAYFARE_RUNTIME === "firebase"
      ? (await import("./adapters/db/firestore")).createFirestoreStore()
      : (await import("./adapters/db/sqlite")).createSqliteStore(`${cfg.DATA_DIR}/wayfare.db`);

  let blobs: BlobStorage;
  switch (cfg.storageDriver) {
    case "firebase":
      blobs = (await import("./adapters/storage/firebase")).createFirebaseStorage();
      break;
    case "s3":
      blobs = (await import("./adapters/storage/s3")).createS3Storage();
      break;
    default:
      blobs = (await import("./adapters/storage/local")).createLocalStorage(`${cfg.DATA_DIR}/blobs`);
  }

  const mailer: Mailer = cfg.SMTP_URL
    ? (await import("./adapters/mail/smtp")).createSmtpMailer(cfg.SMTP_URL, cfg.MAIL_FROM)
    : (await import("./adapters/mail/console")).createConsoleMailer();

  return { db, blobs, mailer };
}

/** Process-wide singleton (survives Next.js dev HMR via globalThis). */
export function container(): Promise<Container> {
  if (!g.__wayfareContainer) g.__wayfareContainer = build();
  return g.__wayfareContainer;
}

export const getDb = async () => (await container()).db;
export const getBlobs = async () => (await container()).blobs;
export const getMailer = async () => (await container()).mailer;
