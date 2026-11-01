import { cache, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarX2, Pencil } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemedSurface } from "@/themes";
import { AlbumHero } from "@/components/viewer/AlbumHero";
import { GuestUpload } from "@/components/viewer/GuestUpload";
import { PasswordGate } from "@/components/viewer/PasswordGate";
import { PhotoGallery } from "@/components/viewer/PhotoGallery";
import type { ViewerConfig, ViewerPhoto } from "@/components/viewer/types";
import { ViewerBar } from "@/components/viewer/ViewerBar";
import { ViewerFooter } from "@/components/viewer/ViewerFooter";
import type { Theme } from "@/domain/theme";
import { recordAlbumView, resolveAlbumAccess } from "@/server/services/albums";
import { getUserReactions } from "@/server/services/interactions";
import { getPhoto, listPhotos, mediaUrl } from "@/server/services/photos";
import { resolveTheme } from "@/server/services/themes";
import { getCurrentUser } from "@/server/services/session";
import { loginHref } from "../../_lib/guards";

/** Media URLs on the page are valid for 3 hours – long enough for a relaxed browsing session. */
const MEDIA_TTL = 3 * 3600;

const getAccess = cache(async (slug: string) => {
  const viewer = await getCurrentUser().catch(() => null);
  const access = await resolveAlbumAccess(slug, viewer);
  return { viewer, access };
});

const NO_INDEX: Metadata["robots"] = { index: false, follow: false, nocache: true, noimageindex: true };

export async function generateMetadata({ params }: PageProps<"/a/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("viewer");
  const { access } = await getAccess(slug);
  if (access.status === "not-found") return { title: t("notFound.title"), robots: NO_INDEX };

  const title = access.album.title;
  const meta: Metadata = { title, robots: NO_INDEX, openGraph: { title, type: "website", description: t("meta.description") }, description: t("meta.description") };

  // Privacy: the cover only goes into the social preview when the owner explicitly allows downloads
  // and the album is reachable by link alone.
  if (access.status === "granted" && access.album.downloads.allowed && access.album.access.mode === "link" && access.album.status === "published" && access.album.coverPhotoId) {
    const cover = await getPhoto(access.album.coverPhotoId).catch(() => null);
    if (cover) meta.openGraph = { ...meta.openGraph, images: [{ url: mediaUrl(cover, "display", { album: access.album, ttlSeconds: 24 * 3600 }), width: cover.width, height: cover.height }] };
  }
  return meta;
}

async function CenteredState({ theme, children, viewer, slug }: { theme: Theme; children: ReactNode; viewer: { name: string } | null; slug: string }) {
  return (
    <ThemedSurface theme={theme} className="flex min-h-dvh flex-col">
      <ViewerBar viewer={viewer} loginHref={loginHref(`/a/${slug}`)} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">{children}</main>
      <ViewerFooter />
    </ThemedSurface>
  );
}

export default async function AlbumPage({ params }: PageProps<"/a/[slug]">) {
  const { slug } = await params;
  const { viewer, access } = await getAccess(slug);
  if (access.status === "not-found") notFound();

  const theme = await resolveTheme(access.album.themeId);
  const t = await getTranslations("viewer");
  const viewerInfo = viewer ? { name: viewer.name } : null;

  if (access.status === "expired") {
    return (
      <CenteredState theme={theme} viewer={viewerInfo} slug={slug}>
        <div className="w-full max-w-md rounded-3xl bg-[var(--wf-surface)] p-8 text-center shadow-2xl ring-1 ring-black/5" data-testid="album-expired">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--wf-accent)_16%,transparent)] text-[var(--wf-accent)]">
            <CalendarX2 className="size-6" aria-hidden />
          </div>
          <h1 className="wf-heading text-3xl leading-tight">{access.album.title}</h1>
          <p className="mt-3 text-[var(--wf-muted)]">{t("expired.description")}</p>
          <p className="mt-2 text-sm text-[var(--wf-muted)]">{t("expired.hint")}</p>
        </div>
      </CenteredState>
    );
  }

  if (access.status === "password-required") {
    return (
      <CenteredState theme={theme} viewer={viewerInfo} slug={slug}>
        <PasswordGate slug={slug} title={access.album.title} ornament={theme.ornament} />
      </CenteredState>
    );
  }

  const { album } = access;
  await recordAlbumView(album).catch(() => undefined);

  const [photos, mine, locale] = await Promise.all([
    listPhotos(album.id, "approved"),
    viewer ? getUserReactions(viewer.id, album.id).catch(() => ({}) as Record<string, string[]>) : Promise.resolve({} as Record<string, string[]>),
    getLocale().then((l) => (l === "de" ? ("de" as const) : ("en" as const))),
  ]);

  const downloads = album.downloads.allowed;
  const items: ViewerPhoto[] = photos.map((p) => ({
    id: p.id,
    width: p.width,
    height: p.height,
    color: p.dominantColor,
    caption: p.caption,
    thumb: mediaUrl(p, "thumb", { album, ttlSeconds: MEDIA_TTL }),
    display: mediaUrl(p, "display", { album, ttlSeconds: MEDIA_TTL }),
    // Original URLs are only ever rendered when the owner allows downloads.
    original: downloads ? mediaUrl(p, "original", { album, ttlSeconds: MEDIA_TTL, download: true }) : null,
    reactions: p.reactionCounts,
    commentCount: p.commentCount,
    mine: mine[p.id] ?? [],
  }));

  const coverPhoto = photos.find((p) => p.id === album.coverPhotoId) ?? photos[0];
  const cover = coverPhoto
    ? { src: mediaUrl(coverPhoto, "display", { album, ttlSeconds: MEDIA_TTL }), alt: coverPhoto.caption || album.title, color: coverPhoto.dominantColor }
    : null;

  const isOwner = !!viewer && (viewer.id === album.ownerId || viewer.role === "admin");
  const config: ViewerConfig = {
    slug,
    protect: !downloads,
    downloads,
    reactionsEnabled: album.reactions.enabled,
    reactions: theme.reactions,
    commentMode: album.comments.mode,
    guestUploads: album.guestUploads.enabled,
    viewer: viewer ? { id: viewer.id, name: viewer.name } : null,
    isOwner,
    loginHref: loginHref(`/a/${slug}`),
    locale,
  };

  return (
    <ThemedSurface theme={theme} className="flex min-h-dvh flex-col">
      <ViewerBar viewer={viewerInfo} loginHref={config.loginHref} editHref={isOwner ? `/dashboard/albums/${album.id}` : undefined} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6">
        {album.status === "draft" && isOwner ? (
          <p className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-[var(--wf-surface)] px-4 py-3 text-center text-sm text-[var(--wf-muted)] ring-1 ring-black/5" role="status" data-testid="draft-banner">
            <Pencil className="size-4 shrink-0" aria-hidden /> {t("draftBanner")}
          </p>
        ) : null}

        <AlbumHero title={album.title} message={album.message} ornament={theme.ornament} cover={cover} protect={config.protect} />

        {items.length > 0 ? (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <h2 className="text-sm font-semibold tracking-wide text-[var(--wf-muted)] uppercase">{t("gallery.count", { count: items.length })}</h2>
              {config.guestUploads ? <GuestUpload config={config} /> : null}
            </div>
            <PhotoGallery initial={items} config={config} />
          </>
        ) : (
          <div className="mx-auto max-w-md rounded-3xl bg-[var(--wf-surface)] p-10 text-center ring-1 ring-black/5" data-testid="album-empty">
            <p className="wf-heading text-2xl">{t("empty.title")}</p>
            <p className="mt-2 text-sm text-[var(--wf-muted)]">{t("empty.description")}</p>
            {config.guestUploads ? (
              <div className="mt-6 flex justify-center">
                <GuestUpload config={config} />
              </div>
            ) : null}
          </div>
        )}
      </main>
      <ViewerFooter />
    </ThemedSurface>
  );
}
