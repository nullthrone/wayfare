import "server-only";
import { createTranslator } from "next-intl";
import { nanoid } from "nanoid";
import type { Album, PendingNotification } from "@/domain/types";
import { config } from "../config";
import { getDb, getMailer } from "../container";
import { COLLECTIONS, type Doc } from "../ports/document-store";
import { getAuthUser, nowIso, type AuthUserDoc } from "../repo";
import mailDe from "../../../messages/de/mail.json";
import mailEn from "../../../messages/en/mail.json";

/**
 * Owner notifications per album.notifications.mode:
 *  - "instant": send an e-mail right away (best-effort, errors are logged, never thrown)
 *  - "daily":   store a PendingNotification; sendDailyDigests() (called by /api/cron/digest,
 *               protected by CRON_SECRET) sends one mail per owner and clears them
 *  - "off":     nothing
 * Mails are localised by the owner's preferred locale if known (fallback "en").
 * Mails are plain text only.
 */

const MESSAGES = { de: { mail: mailDe }, en: { mail: mailEn } } as const;
type MailLocale = keyof typeof MESSAGES;

/** Translator for the `mail` namespace. Exported for the invite mail in admin.ts. */
export function mailTranslator(locale: string | null | undefined) {
  const l: MailLocale = locale === "de" ? "de" : "en";
  return (createTranslator as unknown as (arg: unknown) => unknown)({ locale: l, messages: MESSAGES[l], namespace: "mail" }) as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
}

const KIND_KEY = { comment: "newComment", "guest-upload": "guestUpload", report: "report" } as const;
const withFooter = (t: (key: string) => string, body: string) => `${body}\n\n-- \n${t("footer")}\n`;
const dashboardUrl = () => `${config().baseUrl}/dashboard`;

export async function notifyOwner(album: Album, event: { kind: PendingNotification["kind"]; summary: string }): Promise<void> {
  try {
    const mode = album.notifications.mode;
    if (mode === "off") return;
    const db = await getDb();
    if (mode === "daily") {
      const doc: PendingNotification = {
        id: nanoid(),
        ownerId: album.ownerId,
        albumId: album.id,
        albumTitle: album.title,
        kind: event.kind,
        summary: event.summary.slice(0, 300),
        createdAt: nowIso(),
      };
      await db.create(COLLECTIONS.pendingNotifications.name, doc as unknown as Doc);
      return;
    }
    // instant
    const owner = await getAuthUser(album.ownerId);
    if (!owner || owner.banned || !owner.email) return;
    const t = mailTranslator(owner.locale);
    const base = KIND_KEY[event.kind];
    await (await getMailer()).send({
      to: owner.email,
      subject: t(`${base}.subject`, { album: album.title }),
      text: withFooter(t, t(`${base}.body`, { name: owner.name || owner.email, album: album.title, summary: event.summary, url: dashboardUrl() })),
    });
  } catch (err) {
    console.error("[notifications] notifyOwner failed", err);
  }
}

export async function sendDailyDigests(): Promise<{ owners: number; notifications: number }> {
  const db = await getDb();
  const mailer = await getMailer();
  const docs = await db.find<Doc>(COLLECTIONS.pendingNotifications.name, {
    sort: [{ field: "createdAt", direction: "asc" }],
    limit: 5000,
  });
  const byOwner = new Map<string, PendingNotification[]>();
  for (const d of docs as unknown as PendingNotification[]) {
    const list = byOwner.get(d.ownerId) ?? [];
    list.push(d);
    byOwner.set(d.ownerId, list);
  }

  let owners = 0;
  let sent = 0;
  for (const [ownerId, items] of byOwner) {
    const ids = items.map((i) => i.id);
    try {
      const owner: AuthUserDoc | null = await getAuthUser(ownerId);
      if (!owner || owner.banned || !owner.email) {
        // nobody to notify any more → drop
        await db.deleteMany(COLLECTIONS.pendingNotifications.name, { where: [{ field: "id", op: "in", value: ids }] });
        continue;
      }
      const t = mailTranslator(owner.locale);
      const byAlbum = new Map<string, PendingNotification[]>();
      for (const i of items) {
        const l = byAlbum.get(i.albumId) ?? [];
        l.push(i);
        byAlbum.set(i.albumId, l);
      }
      const sections: string[] = [];
      for (const list of byAlbum.values()) {
        const lines = list.map((i) => `  - ${t(`digest.kind.${KIND_KEY[i.kind] ?? "newComment"}`)}: ${i.summary}`);
        sections.push([t("digest.albumHeading", { album: list[0].albumTitle, count: list.length }), ...lines].join("\n"));
      }
      await mailer.send({
        to: owner.email,
        subject: t("digest.subject", { count: items.length }),
        text: withFooter(t, t("digest.body", { name: owner.name || owner.email, items: sections.join("\n\n"), url: dashboardUrl() })),
      });
      await db.deleteMany(COLLECTIONS.pendingNotifications.name, { where: [{ field: "id", op: "in", value: ids }] });
      owners++;
      sent += items.length;
    } catch (err) {
      // keep the notifications; the next run retries
      console.error(`[notifications] digest for owner ${ownerId} failed`, err);
    }
  }
  return { owners, notifications: sent };
}
