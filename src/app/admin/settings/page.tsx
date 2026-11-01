import { getTranslations } from "next-intl/server";
import { InstanceSettingsForm } from "@/components/admin/InstanceSettingsForm";
import { getInstanceSettings } from "@/server/services/admin";
import { guard, requireAdminPage } from "../../_lib/guards";

export async function generateMetadata() {
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

export default async function AdminSettingsPage() {
  await requireAdminPage("/admin/settings");
  const t = await getTranslations("admin.settings");
  const s = await guard("/admin/settings", () => getInstanceSettings());
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("subtitle")}</p>
      <InstanceSettingsForm
        values={{
          instanceName: s.instanceName,
          onboardingMode: s.onboardingMode,
          maxUploadMb: s.maxUploadMb,
          maxPhotosPerAlbum: s.maxPhotosPerAlbum,
          imprint: s.legal.imprint,
          privacy: s.legal.privacy,
        }}
      />
    </main>
  );
}
