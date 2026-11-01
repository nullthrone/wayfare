import { Ban, Check, EyeOff, Flag, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  deleteCommentAction,
  moderateCommentAction,
  moderatePhotoAction,
  resolveReportAction,
  setBlockedAction,
} from "@/app/dashboard/albums/[albumId]/actions";
import type { Comment, Photo, Report } from "@/domain/types";
import { mediaUrl } from "@/server/services/photos";
import type { MediaScope } from "@/server/services/photos";
import { Badge } from "../ui/Badge";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { ActionButton } from "../ui/action";

export async function ModerationTab({
  album,
  albumId,
  pendingPhotos,
  pendingComments,
  reports,
  blockedUserIds,
}: {
  album: MediaScope;
  albumId: string;
  pendingPhotos: Photo[];
  pendingComments: Comment[];
  reports: (Report & { comment: Comment | null })[];
  blockedUserIds: string[];
}) {
  const t = await getTranslations("album.moderation");
  const format = await getFormatter();
  const openReports = reports.filter((r) => !r.resolved);
  const nothing = pendingPhotos.length + pendingComments.length + openReports.length === 0;

  // Names for blocked users are only known if they appear in the comments we have loaded.
  const names = new Map<string, string>();
  for (const c of pendingComments) names.set(c.authorId, c.authorName);
  for (const r of reports) if (r.comment) names.set(r.comment.authorId, r.comment.authorName);

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-6" data-testid="moderation">
      {nothing ? <EmptyState icon={<ShieldCheck />} title={t("empty.title")} description={t("empty.description")} /> : null}

      {pendingPhotos.length > 0 ? (
        <Card data-testid="pending-photos">
          <CardHeader title={t("photos.title")} description={t("photos.description")} />
          <CardBody>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingPhotos.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-xl border border-line">
                  <div className="aspect-[4/3]" style={{ backgroundColor: p.dominantColor }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL */}
                    <img src={mediaUrl(p, "thumb", { album, ttlSeconds: 3 * 3600 })} alt="" loading="lazy" className="size-full object-cover" />
                  </div>
                  <div className="space-y-3 p-3">
                    <p className="text-sm text-muted">{t("photos.by", { name: p.uploaderName, date: date(p.createdAt) })}</p>
                    <div className="flex gap-2">
                      <ActionButton size="sm" action={moderatePhotoAction.bind(null, albumId, p.id, "approve")}>
                        <Check className="size-4" aria-hidden /> {t("approve")}
                      </ActionButton>
                      <ActionButton size="sm" variant="outline" action={moderatePhotoAction.bind(null, albumId, p.id, "reject")}>
                        <X className="size-4" aria-hidden /> {t("reject")}
                      </ActionButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {pendingComments.length > 0 ? (
        <Card data-testid="pending-comments">
          <CardHeader title={t("comments.title")} description={t("comments.description")} />
          <ul className="divide-y divide-line">
            {pendingComments.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {c.authorName} <span className="font-normal text-muted">· {date(c.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                </div>
                <div className="flex gap-2">
                  <ActionButton size="sm" action={moderateCommentAction.bind(null, albumId, c.id, "visible")}>
                    <Check className="size-4" aria-hidden /> {t("approve")}
                  </ActionButton>
                  <ActionButton size="sm" variant="outline" action={moderateCommentAction.bind(null, albumId, c.id, "hidden")}>
                    <EyeOff className="size-4" aria-hidden /> {t("hide")}
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {openReports.length > 0 ? (
        <Card data-testid="reports">
          <CardHeader title={t("reports.title")} description={t("reports.description")} />
          <ul className="divide-y divide-line">
            {openReports.map((r) => (
              <li key={r.id} className="space-y-3 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="warn">
                    <Flag className="size-3" aria-hidden /> {t("reports.reason")}
                  </Badge>
                  <span className="text-ink">{r.reason || t("reports.noReason")}</span>
                  <span className="text-muted">· {date(r.createdAt)}</span>
                </div>
                {r.comment ? (
                  <blockquote className="rounded-xl bg-paper-deep px-4 py-3 text-sm">
                    <p className="mb-1 font-medium">{r.comment.authorName}</p>
                    <p className="whitespace-pre-wrap">{r.comment.body}</p>
                  </blockquote>
                ) : (
                  <p className="text-sm text-muted italic">{t("reports.commentGone")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <ActionButton size="sm" variant="outline" action={resolveReportAction.bind(null, albumId, r.id)}>
                    <Check className="size-4" aria-hidden /> {t("reports.resolve")}
                  </ActionButton>
                  {r.comment ? (
                    <>
                      <ActionButton
                        size="sm"
                        variant="danger-outline"
                        action={deleteCommentAction.bind(null, albumId, r.comment!.id)}
                        confirm={{ title: t("reports.deleteConfirm.title"), description: t("reports.deleteConfirm.description"), confirmLabel: t("reports.deleteConfirm.confirm") }}
                      >
                        <Trash2 className="size-4" aria-hidden /> {t("reports.delete")}
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        variant="danger-outline"
                        action={setBlockedAction.bind(null, albumId, r.comment!.authorId, true)}
                        confirm={{ title: t("block.confirmTitle", { name: r.comment.authorName }), description: t("block.confirmDescription"), confirmLabel: t("block.confirm") }}
                      >
                        <Ban className="size-4" aria-hidden /> {t("reports.block")}
                      </ActionButton>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card data-testid="blocked-users">
        <CardHeader title={t("block.title")} description={t("block.description")} />
        {blockedUserIds.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">{t("block.empty")}</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {blockedUserIds.map((id) => (
              <li key={id} className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6">
                <span className="min-w-0 truncate text-sm">
                  {names.get(id) ?? t("block.unknownUser")} <span className="font-mono text-xs text-muted">({id.slice(0, 6)}…)</span>
                </span>
                <ActionButton size="sm" variant="outline" action={setBlockedAction.bind(null, albumId, id, false)}>
                  <Undo2 className="size-4" aria-hidden /> {t("block.unblock")}
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
