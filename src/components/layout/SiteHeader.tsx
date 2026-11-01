import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/server/services/session";
import { getInstanceSettings } from "@/server/services/admin";
import { ButtonLink } from "../ui/Button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoMark } from "./Logo";
import { UserMenu } from "./UserMenu";

export async function SiteHeader() {
  const t = await getTranslations("common");
  const [user, settings] = await Promise.all([
    getCurrentUser().catch(() => null),
    getInstanceSettings().catch(() => null),
  ]);
  const name = settings?.instanceName || "Wayfare";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur" data-testid="site-header">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg text-accent" aria-label={t("homeAria", { name })}>
          <LogoMark />
          <span className="text-lg font-semibold tracking-tight text-ink">{name}</span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageSwitcher className="text-muted" />
          {user ? (
            <UserMenu user={{ name: user.name, email: user.email, role: user.role }} />
          ) : (
            <ButtonLink href="/login" size="sm" data-testid="header-login">
              {t("signIn")}
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
