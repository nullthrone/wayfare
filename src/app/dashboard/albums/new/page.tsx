import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm, SubmitButton } from "@/components/ui/action";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Field";
import { ThemePicker } from "@/components/theme-builder/ThemePicker";
import { NEUTRAL_THEME_ID } from "@/themes";
import { listAvailableThemes } from "@/server/services/themes";
import { guard, requireOwnerPage } from "../../../_lib/guards";
import { createAlbumAction } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.newAlbum");
  return { title: t("title") };
}

export default async function NewAlbumPage() {
  const user = await requireOwnerPage("/dashboard/albums/new");
  const t = await getTranslations("dashboard.newAlbum");
  const locale = (await getLocale()) === "de" ? "de" : "en";
  const themes = await guard("/dashboard/albums/new", () => listAvailableThemes(user));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <Link href="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {t("back")}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("subtitle")}</p>

      <Card className="p-6 sm:p-8">
        <ActionForm action={createAlbumAction} className="space-y-6" data-testid="new-album-form">
          <Input name="title" label={t("fields.title")} required maxLength={120} placeholder={t("fields.titlePlaceholder")} autoFocus />
          <Textarea name="message" label={t("fields.message")} hint={t("fields.messageHint")} maxLength={1000} rows={4} placeholder={t("fields.messagePlaceholder")} />
          <div className="space-y-2" data-testid="theme-picker">
            <p className="text-sm font-medium">{t("fields.theme")}</p>
            <ThemePicker themes={themes} name="themeId" defaultValue={NEUTRAL_THEME_ID} locale={locale} />
          </div>
          <div className="flex justify-end">
            <SubmitButton size="lg">{t("create")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </main>
  );
}
