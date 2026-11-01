"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  deletePhotoAction,
  reorderAction,
  setCoverAction,
  updateCaptionAction,
} from "@/app/dashboard/albums/[albumId]/actions";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ActionButton, useErrorMessage } from "../ui/action";
import { useToast } from "../ui/Toast";

export interface ManagedPhoto {
  id: string;
  thumb: string;
  width: number;
  height: number;
  color: string;
  caption: string;
  uploaderName: string;
  fromGuest: boolean;
}

function CaptionEditor({ albumId, photoId, initial }: { albumId: string; photoId: string; initial: string }) {
  const t = useTranslations("album.photos");
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [value, setValue] = useState(initial);
  const saved = useRef(initial);
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState(false);

  const commit = () => {
    const next = value.trim();
    if (next === saved.current) return;
    start(async () => {
      const res = await updateCaptionAction(albumId, photoId, next);
      if (res.ok) {
        saved.current = next;
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1500);
      } else toast.push("error", errorMessage(res.error));
    });
  };

  return (
    <div className="relative">
      <input
        value={value}
        maxLength={300}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder={t("captionPlaceholder")}
        aria-label={t("caption")}
        className="w-full rounded-lg border border-transparent bg-paper-deep/60 px-2.5 py-1.5 pr-8 text-sm placeholder:text-muted/70 hover:border-line-strong focus:border-accent focus:bg-surface focus:outline-none"
      />
      {flash ? <Check className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-success" aria-label={t("saved")} /> : null}
    </div>
  );
}

export function PhotoManager({ albumId, photos, coverId }: { albumId: string; photos: ManagedPhoto[]; coverId: string | null }) {
  const t = useTranslations("album.photos");
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [items, setItems] = useState(photos);
  const [cover, setCover] = useState(coverId);
  const [, start] = useTransition();

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const prev = items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    start(async () => {
      const res = await reorderAction(albumId, next.map((p) => p.id));
      if (!res.ok) {
        setItems(prev);
        toast.push("error", errorMessage(res.error));
      }
    });
  };

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="photo-grid">
      {items.map((p, i) => (
        <li key={p.id} className="overflow-hidden rounded-card border border-line bg-surface shadow-card" data-testid="photo-card">
          <div className="relative aspect-[4/3]" style={{ backgroundColor: p.color }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL */}
            <img src={p.thumb} alt={p.caption} loading="lazy" className="size-full object-cover" />
            <div className="absolute top-2 left-2 flex gap-1.5">
              {cover === p.id ? (
                <Badge tone="accent" className="bg-surface/95 shadow-sm">
                  <Star className="size-3 fill-current" aria-hidden /> {t("cover")}
                </Badge>
              ) : null}
              {p.fromGuest ? <Badge className="bg-surface/95 shadow-sm">{t("fromGuest", { name: p.uploaderName })}</Badge> : null}
            </div>
          </div>
          <div className="space-y-2.5 p-3">
            <CaptionEditor albumId={albumId} photoId={p.id} initial={p.caption} />
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" className="px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveEarlier", { n: i + 1 })}>
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <span className="min-w-6 text-center text-xs text-muted tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <Button variant="ghost" size="sm" className="px-2" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t("moveLater", { n: i + 1 })}>
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="flex items-center gap-0.5">
                <ActionButton
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  disabled={cover === p.id}
                  aria-label={t("setCover")}
                  title={t("setCover")}
                  action={() => setCoverAction(albumId, p.id)}
                  onDone={() => setCover(p.id)}
                >
                  <Star className="size-4" aria-hidden />
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  className="px-2 text-danger hover:bg-danger-soft"
                  aria-label={t("delete")}
                  title={t("delete")}
                  action={() => deletePhotoAction(albumId, p.id)}
                  onDone={() => setItems((l) => l.filter((x) => x.id !== p.id))}
                  confirm={{ title: t("deleteConfirm.title"), description: t("deleteConfirm.description"), confirmLabel: t("deleteConfirm.confirm") }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </ActionButton>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
