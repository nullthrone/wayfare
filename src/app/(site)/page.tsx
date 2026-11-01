import { redirect } from "next/navigation";
import { Heart, Images, Lock, MessageCircle, Palette, QrCode, Share2, ShieldCheck, Upload } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PostcardArt } from "@/components/layout/PostcardArt";
import { REPO_URL } from "@/components/layout/SiteFooter";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BUILTIN_THEMES } from "@/themes";
import { getCurrentUser, hasRole } from "@/server/services/session";

export default async function LandingPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user && hasRole(user, "owner")) redirect("/dashboard");

  const t = await getTranslations("landing");
  const locale = (await getLocale()) === "de" ? "de" : "en";

  const steps = [
    { icon: Upload, key: "upload" },
    { icon: Palette, key: "theme" },
    { icon: QrCode, key: "share" },
  ] as const;
  const features = [
    { icon: Heart, key: "reactions" },
    { icon: MessageCircle, key: "comments" },
    { icon: Images, key: "guests" },
    { icon: Lock, key: "control" },
    { icon: ShieldCheck, key: "privacy" },
    { icon: Share2, key: "openSource" },
  ] as const;

  return (
    <main data-testid="landing">
      {user ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
          <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center" data-testid="become-owner-card">
            <div>
              <h2 className="text-lg font-semibold">{t("viewerCard.title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("viewerCard.description")}</p>
            </div>
            <ButtonLink href="/become-owner">{t("viewerCard.cta")}</ButtonLink>
          </Card>
        </div>
      ) : null}

      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent uppercase">
            {t("hero.eyebrow")}
          </p>
          <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">{t("hero.title")}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t("hero.subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {!user ? (
              <ButtonLink href="/login" size="lg" data-testid="hero-cta">
                {t("hero.cta")}
              </ButtonLink>
            ) : null}
            <ButtonLink href="#how" size="lg" variant="outline">
              {t("hero.secondary")}
            </ButtonLink>
          </div>
        </div>
        <PostcardArt className="mx-auto w-full max-w-lg" />
      </section>

      <section id="how" className="border-y border-line bg-surface/70">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("how.title")}</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map(({ icon: Icon, key }, i) => (
              <li key={key} className="relative rounded-card border border-line bg-paper p-6">
                <span className="absolute top-5 right-5 text-4xl font-semibold text-line-strong tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(`how.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(`how.${key}.description`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("themes.title")}</h2>
        <p className="mt-2 max-w-2xl text-muted">{t("themes.subtitle")}</p>
        <ul className="mt-8 flex flex-wrap gap-3" data-testid="landing-themes">
          {BUILTIN_THEMES.map((th) => (
            <li
              key={th.id}
              className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: th.colors.background, color: th.colors.text, borderColor: th.colors.accent }}
            >
              <span aria-hidden>{th.ornament || "•"}</span>
              {th.name[locale]}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-paper-deep/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("features.title")}</h2>
          <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, key }) => (
              <li key={key} className="flex gap-4">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent shadow-card">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{t(`features.${key}.title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{t(`features.${key}.description`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("final.title")}</h2>
        <p className="mt-3 text-muted">{t("final.subtitle")}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {!user ? (
            <ButtonLink href="/login" size="lg">
              {t("hero.cta")}
            </ButtonLink>
          ) : (
            <ButtonLink href="/become-owner" size="lg">
              {t("viewerCard.cta")}
            </ButtonLink>
          )}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center rounded-full border border-line-strong bg-surface px-6 text-base font-medium hover:bg-paper-deep"
          >
            {t("final.github")}
          </a>
        </div>
      </section>
    </main>
  );
}
