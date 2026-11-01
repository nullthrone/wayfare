import Link from "next/link";
import { Eye, Image as ImageIcon, Images, Plus } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Album } from "@/domain/types";
import { listAlbumsForOwner } from "@/server/services/albums";
import { getPhoto, mediaUrl } from "@/server/services/photos";
import { guard, requireOwnerPage } from "../_lib/guards";
import { nowMs } from "../_lib/time";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("albums.title") };
}

export default async function DashboardPage() {
  const user = await requireOwnerPage("/dashboard");
  const t = await getTranslations("dashboard.albums");
  const format = await getFormatter();
  const albums = await guard("/dashboard", () => listAlbumsForOwner(user));
  const sorted = [...albums].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const covers = new Map<string, string>();
  await Promise.all(
    sorted.map(async (a) => {
      if (!a.coverPhotoId) return;
      const p = await getPhoto(a.coverPhotoId).catch(() => null);
      if (p) covers.set(a.id, mediaUrl(p, "thumb", { album: a, ttlSeconds: 3 * 3600 }));
    }),
  );

  const now = nowMs();
  const expiry = (a: Album) => {
    if (!a.expiresAt) return null;
    const ts = new Date(a.expiresAt).getTime();
    return ts < now ? { expired: true, label: t("expired") } : { expired: false, label: t("expiresOn", { date: format.dateTime(new Date(a.expiresAt), { dateStyle: "medium" }) }) };
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-muted">{t("subtitle")}</p>
        </div>
        <ButtonLink href="/dashboard/albums/new" data-testid="new-album">
          <Plus className="size-4" aria-hidden /> {t("new")}
        </ButtonLink>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Images />}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <ButtonLink href="/dashboard/albums/new">
              <Plus className="size-4" aria-hidden /> {t("new")}
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="album-grid">
          {sorted.map((a) => {
            const cover = covers.get(a.id);
            const exp = expiry(a);
            return (
              <li key={a.id}>
                <Link
                  href={`/dashboard/albums/${a.id}`}
                  data-testid="album-card"
                  className="group block overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow hover:shadow-pop"
                >
                  <div className="relative aspect-[4/3] bg-paper-deep">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed media URL, not optimisable by next/image
                      <img src={cover} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-line-strong">
                        <ImageIcon className="size-10" aria-hidden />
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      <Badge tone={a.status === "published" ? "success" : "neutral"} className="bg-surface/95 shadow-sm">
                        {t(`status.${a.status}`)}
                      </Badge>
                      {exp ? (
                        <Badge tone={exp.expired ? "danger" : "warn"} className="bg-surface/95 shadow-sm">
                          {exp.label}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="p-4">
                    <h2 className="truncate text-base font-semibold">{a.title}</h2>
                    <p className="mt-2 flex items-center gap-4 text-sm text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Images className="size-4" aria-hidden /> {t("photoCount", { count: a.photoCount })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="size-4" aria-hidden /> {t("viewCount", { count: a.stats.views })}
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
