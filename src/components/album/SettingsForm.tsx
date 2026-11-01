"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { saveSettingsAction } from "@/app/dashboard/albums/[albumId]/actions";
import type { Theme } from "@/domain/theme";
import type { AccessMode, Album } from "@/domain/types";
import { ThemePicker } from "@/components/theme-builder/ThemePicker";
import { Alert } from "../ui/Alert";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { Input, Select, Textarea } from "../ui/Field";
import { Switch } from "../ui/Switch";
import { ActionForm, SubmitButton } from "../ui/action";

export interface SettingsFormAlbum {
  id: string;
  title: string;
  message: string;
  themeId: string;
  accessMode: AccessMode;
  hasPassword: boolean;
  /** yyyy-mm-dd or "" */
  expiresAt: string;
  downloadsAllowed: boolean;
  watermark: boolean;
  watermarkText: string;
  commentMode: Album["comments"]["mode"];
  reactionsEnabled: boolean;
  guestUploadsEnabled: boolean;
  guestUploadLimit: number;
  notifyMode: Album["notifications"]["mode"];
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}

export function SettingsForm({ album, themes, locale }: { album: SettingsFormAlbum; themes: (Theme)[]; locale: "de" | "en" }) {
  const t = useTranslations("album.settings");
  const router = useRouter();
  const [mode, setMode] = useState<AccessMode>(album.accessMode);
  const [downloads, setDownloads] = useState(album.downloadsAllowed);
  const [guests, setGuests] = useState(album.guestUploadsEnabled);

  return (
    <ActionForm
      action={(fd) => saveSettingsAction(album.id, fd)}
      className="space-y-6"
      successMessage={t("saved")}
      toastOnSuccess
      onSuccess={() => router.refresh()}
      data-testid="settings-form"
    >
      <Section title={t("general.title")}>
        <Input name="title" label={t("general.name")} defaultValue={album.title} required maxLength={120} />
        <Textarea name="message" label={t("general.message")} hint={t("general.messageHint")} defaultValue={album.message} maxLength={1000} rows={4} />
        <div className="space-y-2" data-testid="theme-picker">
          <p className="text-sm font-medium">{t("general.theme")}</p>
          <ThemePicker themes={themes} name="themeId" defaultValue={album.themeId} locale={locale} />
        </div>
      </Section>

      <Section title={t("access.title")} description={t("access.description")}>
        <Select name="accessMode" label={t("access.mode")} value={mode} onChange={(e) => setMode(e.target.value as AccessMode)}>
          <option value="link">{t("access.modes.link")}</option>
          <option value="password">{t("access.modes.password")}</option>
        </Select>
        <div className={mode === "password" ? "space-y-3" : "hidden"}>
          <Input
            name="password"
            type="text"
            autoComplete="off"
            label={album.hasPassword ? t("access.newPassword") : t("access.password")}
            hint={album.hasPassword ? t("access.passwordKeep") : t("access.passwordHint")}
            minLength={4}
            maxLength={128}
          />
          <Alert kind="warning">{t("access.passwordWarning")}</Alert>
        </div>
        <Input name="expiresAt" type="date" label={t("access.expires")} hint={t("access.expiresHint")} defaultValue={album.expiresAt} />
      </Section>

      <Section title={t("downloads.title")} description={t("downloads.description")}>
        <Switch
          name="downloadsAllowed"
          label={t("downloads.allowed")}
          description={t("downloads.allowedHint")}
          checked={downloads}
          onChange={(e) => setDownloads(e.target.checked)}
        />
        <div className={downloads ? "hidden" : "space-y-4 rounded-xl bg-paper-deep/60 p-4"}>
          <Alert kind="info">{t("downloads.protectionNote")}</Alert>
          <Switch name="watermark" label={t("downloads.watermark")} description={t("downloads.watermarkHint")} defaultChecked={album.watermark} />
          <Input name="watermarkText" label={t("downloads.watermarkText")} hint={t("downloads.watermarkTextHint")} defaultValue={album.watermarkText} maxLength={60} />
        </div>
      </Section>

      <Section title={t("interaction.title")}>
        <Select name="commentMode" label={t("interaction.comments")} defaultValue={album.commentMode}>
          <option value="post">{t("interaction.commentModes.post")}</option>
          <option value="pre">{t("interaction.commentModes.pre")}</option>
          <option value="off">{t("interaction.commentModes.off")}</option>
        </Select>
        <Switch name="reactionsEnabled" label={t("interaction.reactions")} description={t("interaction.reactionsHint")} defaultChecked={album.reactionsEnabled} />
        <Switch
          name="guestUploadsEnabled"
          label={t("interaction.guestUploads")}
          description={t("interaction.guestUploadsHint")}
          checked={guests}
          onChange={(e) => setGuests(e.target.checked)}
        />
        <div className={guests ? "" : "hidden"}>
          <Input
            name="guestUploadLimit"
            type="number"
            min={1}
            max={500}
            label={t("interaction.guestLimit")}
            hint={t("interaction.guestLimitHint")}
            defaultValue={album.guestUploadLimit}
            wrapperClassName="max-w-xs"
          />
        </div>
      </Section>

      <Section title={t("notifications.title")}>
        <Select name="notifyMode" label={t("notifications.label")} hint={t("notifications.hint")} defaultValue={album.notifyMode}>
          <option value="off">{t("notifications.modes.off")}</option>
          <option value="instant">{t("notifications.modes.instant")}</option>
          <option value="daily">{t("notifications.modes.daily")}</option>
        </Select>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-line bg-paper/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border">
        <SubmitButton size="lg" data-testid="save-settings">
          {t("save")}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
