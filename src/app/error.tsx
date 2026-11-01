"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-4 py-24 text-center" data-testid="error-page">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-8" aria-hidden />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{t("error.title")}</h1>
      <p className="mt-3 text-muted">{t("error.description")}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p> : null}
      <div className="mt-8 flex gap-3">
        <Button onClick={reset}>{t("error.retry")}</Button>
        <ButtonLink href="/" variant="outline">
          {t("notFound.home")}
        </ButtonLink>
      </div>
    </main>
  );
}
