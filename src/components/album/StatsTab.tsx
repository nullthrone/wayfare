import { Eye, Heart, Images, MessageCircle, ShieldCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { Photo } from "@/domain/types";
import type { AlbumStats } from "@/server/services/albums";
import { mediaUrl } from "@/server/services/photos";
import type { MediaScope } from "@/server/services/photos";
import { Alert } from "../ui/Alert";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

export async function StatsTab({ album, stats, photos }: { album: MediaScope; stats: AlbumStats; photos: Photo[] }) {
  const t = await getTranslations("album.stats");
  const format = await getFormatter();
  const byId = new Map(photos.map((p) => [p.id, p]));
  const tiles = [
    { icon: Eye, label: t("views"), value: stats.views },
    { icon: Images, label: t("photos"), value: stats.photoCount },
    { icon: MessageCircle, label: t("comments"), value: stats.commentCount },
    { icon: Heart, label: t("reactions"), value: stats.reactionCount },
  ];
  const top = stats.topPhotos.map((tp) => ({ ...tp, photo: byId.get(tp.photoId) })).filter((x) => x.photo);

  return (
    <div className="space-y-6" data-testid="stats">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-5">
            <dt className="flex items-center gap-2 text-sm text-muted">
              <Icon className="size-4" aria-hidden /> {label}
            </dt>
            <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{format.number(value)}</dd>
          </Card>
        ))}
      </dl>
      <p className="text-sm text-muted">
        {stats.lastViewedAt
          ? t("lastViewed", { date: format.dateTime(new Date(stats.lastViewedAt), { dateStyle: "medium", timeStyle: "short" }) })
          : t("neverViewed")}
      </p>

      <Card>
        <CardHeader title={t("top.title")} description={t("top.description")} />
        <CardBody>
          {top.length === 0 ? (
            <EmptyState title={t("top.empty")} className="border-0 py-8" />
          ) : (
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {top.map(({ photo, views, reactions }, i) => (
                <li key={photo!.id} className="overflow-hidden rounded-xl border border-line">
                  <div className="relative aspect-square" style={{ backgroundColor: photo!.dominantColor }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL */}
                    <img src={mediaUrl(photo!, "thumb", { album, ttlSeconds: 3 * 3600 })} alt="" loading="lazy" className="size-full object-cover" />
                    <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-surface text-xs font-semibold shadow">{i + 1}</span>
                  </div>
                  <p className="flex items-center justify-between px-3 py-2 text-sm text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3.5" aria-hidden /> {views}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3.5" aria-hidden /> {reactions}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Alert kind="info" title={t("privacy.title")}>
        <span className="inline-flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("privacy.text")}
        </span>
      </Alert>
    </div>
  );
}
