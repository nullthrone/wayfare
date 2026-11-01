import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "@/components/layout/SiteShell";
import { ButtonLink } from "@/components/ui/Button";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <SiteShell>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center" data-testid="not-found">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Compass className="size-8" aria-hidden />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("notFound.title")}</h1>
        <p className="mt-3 text-muted">{t("notFound.description")}</p>
        <ButtonLink href="/" className="mt-8" variant="primary">
          {t("notFound.home")}
        </ButtonLink>
      </main>
    </SiteShell>
  );
}
