import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/account/LoginForm";
import { safePath } from "@/components/layout/safe-path";
import { Card } from "@/components/ui/Card";
import { getLoginMethods } from "@/server/auth/methods";
import { getCurrentUser } from "@/server/services/session";

export async function generateMetadata() {
  const t = await getTranslations("account.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const callbackURL = safePath(sp.callbackURL, "/");
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(callbackURL);

  const t = await getTranslations("account.login");
  const methods = await getLoginMethods();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-center text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 mb-8 text-center text-muted">{t("subtitle")}</p>
      <Card className="p-6 sm:p-8">
        <LoginForm methods={methods} callbackURL={callbackURL} />
      </Card>
    </main>
  );
}
