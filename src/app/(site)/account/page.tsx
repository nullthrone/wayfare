import { getTranslations } from "next-intl/server";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { PasskeyManager } from "@/components/account/PasskeyManager";
import { ProfileForm } from "@/components/account/ProfileForm";
import { SourceConnections } from "@/components/import/SourceConnections";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { SectionNav } from "@/components/layout/SectionNav";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getLoginMethods } from "@/server/auth/methods";
import { hasRole } from "@/server/services/session";
import { listSources } from "@/server/sources";
import { guard, requireUserPage } from "../../_lib/guards";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const user = await requireUserPage("/account");
  const t = await getTranslations("account");
  const nav = await getTranslations("common.nav");
  const methods = await getLoginMethods();
  const isOwner = hasRole(user, "owner");
  const sources = isOwner ? await guard("/account", () => listSources(user)) : [];

  return (
    <>
      {isOwner ? (
        <SectionNav
          label={nav("dashboardLabel")}
          items={[
            { href: "/dashboard", label: nav("albums"), exact: true },
            { href: "/dashboard/themes", label: nav("themes") },
            { href: "/account", label: nav("account") },
            ...(hasRole(user, "admin") ? [{ href: "/admin", label: nav("admin") }] : []),
          ]}
        />
      ) : null}
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10 sm:px-6" data-testid="account">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <Badge tone="accent">{t(`roles.${user.role}`)}</Badge>
        </div>

        <Card>
          <CardHeader title={t("profile.title")} />
          <CardBody>
            <ProfileForm name={user.name} email={user.email} />
          </CardBody>
        </Card>

        {methods.passkey ? (
          <Card>
            <CardHeader title={t("passkeys.title")} description={t("passkeys.description")} />
            <CardBody>
              <PasskeyManager />
            </CardBody>
          </Card>
        ) : null}

        {isOwner ? (
          <Card data-testid="photo-sources">
            <CardHeader title={t("sources.title")} description={t("sources.description")} />
            <CardBody>
              <SourceConnections sources={sources} />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={t("language.title")} description={t("language.description")} />
          <CardBody>
            <LanguageSwitcher showLabel className="text-base" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("session.title")} />
          <CardBody>
            <SignOutButton className={buttonClasses({ variant: "outline" })}>{t("session.signOut")}</SignOutButton>
          </CardBody>
        </Card>

        <section className="rounded-card border border-danger/30 bg-danger-soft/40 p-5 sm:p-6" data-testid="account-danger">
          <h2 className="text-base font-semibold text-danger">{t("delete.sectionTitle")}</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-ink/80">{t("delete.description")}</p>
            <DeleteAccount email={user.email} isOwner={isOwner} />
          </div>
        </section>
      </main>
    </>
  );
}
