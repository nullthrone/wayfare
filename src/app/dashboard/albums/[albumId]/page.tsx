import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ModerationTab } from "@/components/album/ModerationTab";
import { PhotosTab } from "@/components/album/PhotosTab";
import { PublishToggle } from "@/components/album/PublishToggle";
import { DangerZone } from "@/components/album/DangerZone";
import { SettingsForm } from "@/components/album/SettingsForm";
import { ShareTab } from "@/components/album/ShareTab";
import { StatsTab } from "@/components/album/StatsTab";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { getAlbumForOwner, getAlbumStats } from "@/server/services/albums";
import { listModerationQueue } from "@/server/services/interactions";
import { listPhotos } from "@/server/services/photos";
import { listAvailableThemes } from "@/server/services/themes";
import { guard, requireOwnerPage } from "../../../_lib/guards";

const TABS = ["photos", "settings", "share", "moderation", "stats"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata() {
  const t = await getTranslations("album.header");
  return { title: t("metaTitle") };
}

export default async function AlbumEditorPage({ params, searchParams }: PageProps<"/dashboard/albums/[albumId]">) {
  const { albumId } = await params;
  const sp = await searchParams;
  const here = `/dashboard/albums/${albumId}`;
  const user = await requireOwnerPage(here);
  const t = await getTranslations("album");
  const locale = (await getLocale()) === "de" ? "de" : "en";

  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "photos";

  const album = await guard(here, () => getAlbumForOwner(user, albumId));
  const [approved, pending, queue] = await guard(here, () =>
    Promise.all([listPhotos(album.id, "approved"), listPhotos(album.id, "pending"), listModerationQueue(user, album.id)]),
  );
  const moderationCount = pending.length + queue.pendingComments.length + queue.reports.filter((r) => !r.resolved).length;

  const tabs = TABS.map((key) => ({
    key,
    label: t(`tabs.${key}`),
    href: key === "photos" ? here : `${here}?tab=${key}`,
    count: key === "moderation" ? moderationCount : undefined,
  }));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {t("header.back")}
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="album-title">
            {album.title}
          </h1>
          <Badge tone={album.status === "published" ? "success" : "neutral"}>{t(`header.status.${album.status}`)}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/a/${album.slug}`} target="_blank" rel="noopener" variant="outline" data-testid="view-album">
            <ExternalLink className="size-4" aria-hidden /> {t("header.view")}
          </ButtonLink>
          <PublishToggle albumId={album.id} status={album.status} />
        </div>
      </div>

      <Tabs items={tabs} active={tab} label={t("tabs.label")} className="mb-8" />

      {tab === "photos" ? <PhotosTab album={album} photos={approved} pendingCount={pending.length} /> : null}

      {tab === "settings" ? (
        <div className="space-y-8">
          <SettingsForm
            album={{
              id: album.id,
              title: album.title,
              message: album.message,
              themeId: album.themeId,
              accessMode: album.access.mode,
              hasPassword: !!album.access.passwordHash,
              expiresAt: album.expiresAt ? album.expiresAt.slice(0, 10) : "",
              downloadsAllowed: album.downloads.allowed,
              watermark: album.downloads.watermark,
              watermarkText: album.downloads.watermarkText,
              commentMode: album.comments.mode,
              reactionsEnabled: album.reactions.enabled,
              guestUploadsEnabled: album.guestUploads.enabled,
              guestUploadLimit: album.guestUploads.limitPerGuest,
              notifyMode: album.notifications.mode,
            }}
            themes={await guard(here, () => listAvailableThemes(user))}
            locale={locale}
          />
          <DangerZone albumId={album.id} title={album.title} />
        </div>
      ) : null}

      {tab === "share" ? <ShareTab album={album} /> : null}

      {tab === "moderation" ? (
        <ModerationTab
          album={album}
          albumId={album.id}
          pendingPhotos={pending}
          pendingComments={queue.pendingComments}
          reports={queue.reports}
          blockedUserIds={album.blockedUserIds}
        />
      ) : null}

      {tab === "stats" ? <StatsTab album={album} stats={await guard(here, () => getAlbumStats(user, album.id))} photos={approved} /> : null}
    </main>
  );
}
