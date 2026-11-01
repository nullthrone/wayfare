import { getTranslations } from "next-intl/server";
import { SharePanel } from "@/components/share/SharePanel";
import type { Album } from "@/domain/types";
import { shareUrl } from "@/server/services/albums";
import { Alert } from "../ui/Alert";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { PublishToggle } from "./PublishToggle";
import { RotateSlug } from "./RotateSlug";

export async function ShareTab({ album }: { album: Album }) {
  const t = await getTranslations("album.share");
  return (
    <div className="space-y-6" data-testid="share-tab">
      {album.status === "draft" ? (
        <Alert kind="warning" title={t("draft.title")}>
          <div className="space-y-3">
            <p>{t("draft.description")}</p>
            <PublishToggle albumId={album.id} status="draft" />
          </div>
        </Alert>
      ) : null}
      <div data-testid="share-panel">
        <SharePanel albumId={album.id} shareUrl={shareUrl(album)} accessMode={album.access.mode} title={album.title} />
      </div>
      <Card>
        <CardHeader title={t("rotate.title")} />
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-muted">{t("rotate.description")}</p>
          <RotateSlug albumId={album.id} />
        </CardBody>
      </Card>
    </div>
  );
}
