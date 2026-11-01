import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ImportButton } from "@/components/import/ImportButton";
import type { Album, Photo } from "@/domain/types";
import { mediaUrl } from "@/server/services/photos";
import { Alert } from "../ui/Alert";
import { EmptyState } from "../ui/EmptyState";
import { PhotoManager, type ManagedPhoto } from "./PhotoManager";
import { PhotoUploader } from "./PhotoUploader";

export async function PhotosTab({ album, photos, pendingCount }: { album: Album; photos: Photo[]; pendingCount: number }) {
  const t = await getTranslations("album.photos");
  const rows: ManagedPhoto[] = photos.map((p) => ({
    id: p.id,
    thumb: mediaUrl(p, "thumb", { album, ttlSeconds: 3 * 3600 }),
    width: p.width,
    height: p.height,
    color: p.dominantColor,
    caption: p.caption,
    uploaderName: p.uploaderName,
    fromGuest: p.source === "guest-upload",
  }));

  return (
    <div className="space-y-8" data-testid="photos-tab">
      {pendingCount > 0 ? (
        <Alert kind="info">
          {t("pendingNotice", { count: pendingCount })}{" "}
          <Link href={`/dashboard/albums/${album.id}?tab=moderation`} className="font-medium underline underline-offset-4">
            {t("pendingLink")}
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <PhotoUploader albumId={album.id} />
        <div className="flex flex-col gap-2 lg:w-60">
          <p className="text-sm font-medium">{t("import.title")}</p>
          <p className="text-sm text-muted">{t("import.description")}</p>
          <div>
            <ImportButton albumId={album.id} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("title", { count: photos.length })}</h2>
        {rows.length === 0 ? (
          <EmptyState icon={<ImagePlus />} title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <PhotoManager key={`${rows.map((r) => r.id).join(",")}|${album.coverPhotoId}`} albumId={album.id} photos={rows} coverId={album.coverPhotoId} />
        )}
      </div>
    </div>
  );
}
