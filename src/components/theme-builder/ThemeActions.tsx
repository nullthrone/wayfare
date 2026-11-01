"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Trash2, Upload } from "lucide-react";
import { parseThemeJson } from "@/themes/validate";
import { deleteThemeAction, saveThemeAction, setThemePublicAction } from "@/app/dashboard/themes/actions";

const btnCls =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-sm font-medium hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

function useErrorText() {
  const t = useTranslations("themes");
  return (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
}

/** Imports a theme JSON file as a NEW custom theme and opens it in the editor. */
export function ImportThemeButton() {
  const t = useTranslations("themes");
  const errorText = useErrorText();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[] | null>(null);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 100_000) {
      setErrors([t("editor.importTooLarge")]);
      return;
    }
    const parsed = parseThemeJson(await file.text());
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors(null);
    start(async () => {
      const res = await saveThemeAction({ ...parsed.theme, id: "new" });
      if (!res.ok) setErrors([errorText(res.error)]);
      else router.push(`/dashboard/themes/${res.data.id}`);
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" className={btnCls} disabled={pending} onClick={() => ref.current?.click()}>
        <Upload className="size-4" aria-hidden="true" /> {pending ? t("editor.saving") : t("list.import")}
      </button>
      <input ref={ref} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label={t("list.import")} onChange={onChange} />
      {errors ? (
        <div role="alert" className="max-w-md rounded-xl border border-red-500/60 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">{t("editor.importFailed")}</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function DeleteThemeButton({ themeId }: { themeId: string }) {
  const t = useTranslations("themes");
  const errorText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={btnCls}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("list.deleteConfirm"))) return;
          start(async () => {
            const res = await deleteThemeAction(themeId);
            if (!res.ok) setError(errorText(res.error));
            else router.refresh();
          });
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" /> {t("list.delete")}
      </button>
      {error ? <p role="alert" className="w-full text-xs text-red-600">{error}</p> : null}
    </>
  );
}

/** Admin: publish a custom theme instance-wide / take it back. */
export function PublishToggle({ themeId, isPublic }: { themeId: string; isPublic: boolean }) {
  const t = useTranslations("themes");
  const errorText = useErrorText();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={btnCls}
        aria-pressed={isPublic}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setThemePublicAction(themeId, !isPublic);
            if (!res.ok) setError(errorText(res.error));
            else router.refresh();
          })
        }
      >
        <Globe className="size-4" aria-hidden="true" /> {isPublic ? t("list.unpublish") : t("list.publish")}
      </button>
      {error ? <p role="alert" className="w-full text-xs text-red-600">{error}</p> : null}
    </>
  );
}
