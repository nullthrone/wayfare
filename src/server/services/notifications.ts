import "server-only";
import type { Album, PendingNotification } from "@/domain/types";
import { notImplemented } from "../errors";

/**
 * Owner notifications per album.notifications.mode:
 *  - "instant": send an e-mail right away (best-effort, errors are logged, never thrown)
 *  - "daily":   store a PendingNotification; sendDailyDigests() (called by /api/cron/digest,
 *               protected by CRON_SECRET) sends one mail per owner and clears them
 *  - "off":     nothing
 * Mails are localised by the owner's preferred locale if known (fallback "en").
 */

export async function notifyOwner(album: Album, event: { kind: PendingNotification["kind"]; summary: string }): Promise<void> {
  void album; void event;
  return notImplemented("notifyOwner");
}

export async function sendDailyDigests(): Promise<{ owners: number; notifications: number }> {
  return notImplemented("sendDailyDigests");
}
