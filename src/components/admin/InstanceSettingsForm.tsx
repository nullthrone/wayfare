"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { previewMarkdownAction, updateSettingsAction } from "@/app/admin/actions";
import type { OnboardingMode } from "@/domain/types";
import { Button } from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { Fieldset, Input, Textarea } from "../ui/Field";
import { ActionForm, SubmitButton } from "../ui/action";

export interface InstanceSettingsValues {
  instanceName: string;
  onboardingMode: OnboardingMode;
  maxUploadMb: number;
  maxPhotosPerAlbum: number;
  imprint: string;
  privacy: string;
}

function MarkdownField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const t = useTranslations("admin.settings.legal");
  const [value, setValue] = useState(defaultValue);
  const [html, setHtml] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => {
    if (html !== null) return setHtml(null);
    start(async () => {
      const res = await previewMarkdownAction(value);
      setHtml(res.ok ? res.data : "");
    });
  };

  return (
    <div className="space-y-2">
      <Textarea name={name} label={label} rows={10} value={value} onChange={(e) => setValue(e.target.value)} className="font-mono text-[13px]" hint={t("hint")} />
      <Button variant="outline" size="sm" onClick={toggle} loading={pending}>
        {html === null ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        {html === null ? t("preview") : t("hidePreview")}
      </Button>
      {html !== null ? (
        <div
          className="wf-prose rounded-xl border border-line bg-paper p-5"
          data-testid={`preview-${name}`}
          // Sanitised on the server by sanitize-html (see app/_lib/markdown.ts).
          dangerouslySetInnerHTML={{ __html: html || `<p><em>${t("emptyPreview")}</em></p>` }}
        />
      ) : null}
    </div>
  );
}

export function InstanceSettingsForm({ values }: { values: InstanceSettingsValues }) {
  const t = useTranslations("admin.settings");
  const modes: OnboardingMode[] = ["open", "approval", "invite"];
  return (
    <ActionForm action={updateSettingsAction} className="space-y-6" successMessage={t("saved")} toastOnSuccess data-testid="admin-settings-form">
      <Card>
        <CardHeader title={t("general.title")} />
        <CardBody className="space-y-5">
          <Input name="instanceName" label={t("general.name")} hint={t("general.nameHint")} defaultValue={values.instanceName} required maxLength={60} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input name="maxUploadMb" type="number" min={1} max={200} label={t("general.maxUpload")} hint={t("general.maxUploadHint")} defaultValue={values.maxUploadMb} required />
            <Input name="maxPhotosPerAlbum" type="number" min={0} max={100000} label={t("general.maxPhotos")} hint={t("general.maxPhotosHint")} defaultValue={values.maxPhotosPerAlbum} required />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("onboarding.title")} description={t("onboarding.description")} />
        <CardBody>
          <Fieldset legend={t("onboarding.legend")}>
            <div className="grid gap-3">
              {modes.map((m) => (
                <label key={m} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/60">
                  <input type="radio" name="onboardingMode" value={m} defaultChecked={values.onboardingMode === m} className="mt-1 accent-accent" />
                  <span>
                    <span className="block text-sm font-medium">{t(`onboarding.modes.${m}.label`)}</span>
                    <span className="block text-sm text-muted">{t(`onboarding.modes.${m}.description`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </Fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("legal.title")} description={t("legal.description")} />
        <CardBody className="space-y-6">
          <MarkdownField name="imprint" label={t("legal.imprint")} defaultValue={values.imprint} />
          <MarkdownField name="privacy" label={t("legal.privacy")} defaultValue={values.privacy} />
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <SubmitButton size="lg" data-testid="save-admin-settings">
          {t("save")}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
