"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { unlockAlbumAction } from "@/app/a/[slug]/actions";
import { ActionForm, SubmitButton } from "../ui/action";

/** Password form for protected albums; themed via --wf-* variables. */
export function PasswordGate({ slug, title, ornament }: { slug: string; title: string; ornament: string }) {
  const t = useTranslations("viewer.gate");
  const router = useRouter();
  return (
    <div className="w-full max-w-md rounded-3xl bg-[var(--wf-surface)] p-8 text-center shadow-2xl ring-1 ring-black/5" data-testid="password-gate">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--wf-accent)_16%,transparent)] text-[var(--wf-accent)]">
        {ornament ? <span className="text-2xl" aria-hidden>{ornament}</span> : <Lock className="size-6" aria-hidden />}
      </div>
      <h1 className="wf-heading text-3xl leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-[var(--wf-muted)]">{t("description")}</p>
      <ActionForm action={(fd) => unlockAlbumAction(slug, fd)} onSuccess={() => router.refresh()} className="mt-6 space-y-3 text-left">
        <label htmlFor="wf-gate-password" className="sr-only">
          {t("password")}
        </label>
        <input
          id="wf-gate-password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="off"
          placeholder={t("password")}
          className="block w-full rounded-xl border border-[color-mix(in_srgb,var(--wf-text)_25%,transparent)] bg-transparent px-4 py-3 text-base placeholder:text-[var(--wf-muted)] focus:border-[var(--wf-accent)] focus:outline-none"
          data-testid="gate-password"
        />
        <SubmitButton
          size="lg"
          className="w-full !bg-[var(--wf-accent)] !text-[var(--wf-accent-contrast)] hover:opacity-90"
          data-testid="gate-submit"
        >
          <Lock className="size-4" aria-hidden /> {t("unlock")}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
