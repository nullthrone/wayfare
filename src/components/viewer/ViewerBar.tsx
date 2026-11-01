import Link from "next/link";
import { LogIn, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "../layout/LanguageSwitcher";
import { SignOutButton } from "../layout/SignOutButton";

/** Slim, theme-neutral top bar of an album page: language, sign-in / sign-out, edit shortcut for owners. */
export async function ViewerBar({
  viewer,
  loginHref,
  editHref,
}: {
  viewer: { name: string } | null;
  loginHref: string;
  editHref?: string;
}) {
  const t = await getTranslations("viewer.bar");
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[var(--wf-muted)] sm:px-6" data-testid="viewer-bar">
      <LanguageSwitcher />
      <div className="flex items-center gap-4">
        {editHref ? (
          <Link href={editHref} className="inline-flex items-center gap-1.5 font-medium hover:text-[var(--wf-text)]">
            <Pencil className="size-4" aria-hidden /> {t("edit")}
          </Link>
        ) : null}
        {viewer ? (
          <span className="flex items-center gap-3">
            <span className="hidden max-w-40 truncate sm:inline">{viewer.name}</span>
            <SignOutButton redirectTo={null} className="font-medium underline-offset-4 hover:text-[var(--wf-text)] hover:underline">
              {t("signOut")}
            </SignOutButton>
          </span>
        ) : (
          <Link href={loginHref} className="inline-flex items-center gap-1.5 font-medium hover:text-[var(--wf-text)]" data-testid="viewer-login">
            <LogIn className="size-4" aria-hidden /> {t("signIn")}
          </Link>
        )}
      </div>
    </div>
  );
}
