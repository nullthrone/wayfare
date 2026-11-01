import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { config } from "../config";

/**
 * Shared firebase-admin initialisation (Firestore + Storage). Initialised once per process.
 * Credentials: FIREBASE_SERVICE_ACCOUNT (JSON) if set, otherwise Application Default Credentials
 * (Cloud Run / App Hosting / `gcloud auth application-default login`). The Firestore/Storage
 * emulators are picked up automatically through FIRESTORE_EMULATOR_HOST / FIREBASE_STORAGE_EMULATOR_HOST.
 */
export function getFirebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const cfg = config();
  const sa = cfg.FIREBASE_SERVICE_ACCOUNT ? (JSON.parse(cfg.FIREBASE_SERVICE_ACCOUNT) as Record<string, unknown>) : undefined;
  return initializeApp({
    projectId: cfg.FIREBASE_PROJECT_ID ?? (sa?.project_id as string | undefined),
    storageBucket: cfg.FIREBASE_STORAGE_BUCKET,
    ...(sa ? { credential: cert(sa as Parameters<typeof cert>[0]) } : {}),
  });
}
