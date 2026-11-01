"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Lock, MessageCircle, Share2 } from "lucide-react";

export interface SharePanelProps {
  albumId: string;
  shareUrl: string;
  accessMode: "link" | "password";
  title: string;
}

interface ExportCard {
  id: "postcard" | "stickersRound" | "stickersSquare" | "posterA4" | "posterA3" | "socialStory" | "socialSquare" | "qrPng" | "qrSvg";
  format: string;
  query?: string;
  /** File types offered as download buttons. */
  files: { label: "pdf" | "png" | "svg"; query?: string }[];
  /** Whether the "print password hint" option applies. */
  hint?: boolean;
}

const CARDS: ExportCard[] = [
  { id: "postcard", format: "postcard-a6", files: [{ label: "pdf" }], hint: true },
  { id: "stickersRound", format: "stickers", files: [{ label: "pdf", query: "shape=round" }] },
  { id: "stickersSquare", format: "stickers", files: [{ label: "pdf", query: "shape=square" }] },
  { id: "posterA4", format: "poster-a4", files: [{ label: "pdf" }], hint: true },
  { id: "posterA3", format: "poster-a3", files: [{ label: "pdf" }], hint: true },
  { id: "socialStory", format: "social-story", files: [{ label: "png", query: "type=png" }, { label: "svg", query: "type=svg" }] },
  { id: "socialSquare", format: "social-square", files: [{ label: "png", query: "type=png" }, { label: "svg", query: "type=svg" }] },
  { id: "qrPng", format: "qr-png", files: [{ label: "png" }] },
  { id: "qrSvg", format: "qr-svg", files: [{ label: "svg" }] },
];

const noopSubscribe = () => () => {};
const canShareNative = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-sm font-medium hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2";

export function SharePanel({ albumId, shareUrl, accessMode, title }: SharePanelProps) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const [passwordHint, setPasswordHint] = useState(false);
  const nativeShare = useSyncExternalStore(noopSubscribe, canShareNative, () => false);

  const base = `/api/albums/${encodeURIComponent(albumId)}/export`;
  const shareText = `${t("panel.shareText", { title })}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  async function share() {
    try {
      await navigator.share({ title: t("panel.shareTitle", { title }), text: shareText, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  }

  return (
    <section aria-labelledby="share-title" className="space-y-6">
      <header>
        <h2 id="share-title" className="text-xl font-semibold">{t("panel.title")}</h2>
        <p className="mt-1 text-sm opacity-80">{t("panel.intro")}</p>
      </header>

      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="mx-auto sm:mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${base}/qr-svg?inline=1`}
            alt={t("panel.qrAlt", { title })}
            width={176}
            height={176}
            className="size-44 rounded-xl border border-current/15 bg-white p-1"
          />
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor="share-link" className="mb-1 block text-sm font-medium">{t("panel.linkLabel")}</label>
            <input
              id="share-link"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-current/25 bg-transparent px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={btn}>
              {copied === "ok" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied === "ok" ? t("panel.copied") : t("panel.copyLink")}
            </button>
            {nativeShare ? (
              <button type="button" onClick={share} className={btn}>
                <Share2 className="size-4" aria-hidden="true" /> {t("panel.shareNative")}
              </button>
            ) : null}
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={btn}>
              <MessageCircle className="size-4" aria-hidden="true" /> {t("panel.shareWhatsApp")}
            </a>
          </div>
          <p role="status" className="min-h-5 text-xs text-red-600">{copied === "failed" ? t("panel.copyFailed") : ""}</p>
          {accessMode === "password" ? (
            <div className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{t("panel.passwordNote")}</span>
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={passwordHint} onChange={(e) => setPasswordHint(e.target.checked)} className="mt-1 size-4" />
                <span>{t("panel.passwordHintLabel")}</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold">{t("panel.exportsTitle")}</h3>
        <p className="mt-1 text-sm opacity-80">{t("panel.exportsIntro")}</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CARDS.map((c) => (
            <li key={c.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-current/15 p-4">
              <div>
                <h4 className="font-semibold">{t(`cards.${c.id}.title`)}</h4>
                <p className="mt-1 text-sm opacity-90">{t(`cards.${c.id}.description`)}</p>
                <p className="mt-2 text-xs opacity-70">{t(`cards.${c.id}.tip`)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.files.map((f) => {
                  const q = [f.query, c.hint && passwordHint && accessMode === "password" ? "passwordHint=1" : ""].filter(Boolean).join("&");
                  return (
                    <a key={f.label} href={`${base}/${c.format}${q ? `?${q}` : ""}`} download className={btn}>
                      <Download className="size-4" aria-hidden="true" />
                      {t("panel.download")} · {t(`formats.${f.label}`)}
                    </a>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
