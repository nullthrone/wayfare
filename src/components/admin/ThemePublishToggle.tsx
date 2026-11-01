"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setThemePublicAction } from "@/app/admin/actions";
import { Switch } from "../ui/Switch";
import { useErrorMessage } from "../ui/action";
import { useToast } from "../ui/Toast";

export function ThemePublishToggle({ themeId, isPublic, name }: { themeId: string; isPublic: boolean; name: string }) {
  const t = useTranslations("admin.themes");
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [value, setValue] = useState(isPublic);
  const [pending, start] = useTransition();
  return (
    <Switch
      label={<span className="sr-only">{t("publishFor", { name })}</span>}
      checked={value}
      disabled={pending}
      data-testid="theme-public-toggle"
      onChange={(e) => {
        const next = e.target.checked;
        setValue(next);
        start(async () => {
          const res = await setThemePublicAction(themeId, next);
          if (!res.ok) {
            setValue(!next);
            toast.push("error", errorMessage(res.error));
          }
        });
      }}
    />
  );
}
