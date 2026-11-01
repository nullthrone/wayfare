import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getInstanceSettings } from "@/server/services/admin";
import { renderMarkdown } from "../../../_lib/markdown";

export async function generateMetadata() {
  const t = await getTranslations("legal");
  return { title: t("imprint") };
}

export default async function ImprintPage() {
  const settings = await getInstanceSettings();
  const md = settings.legal.imprint.trim();
  if (!md) notFound();
  const html = renderMarkdown(md);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6" data-testid="legal-imprint">
      <article
        className="wf-prose"
        // Markdown → HTML, sanitised server-side with sanitize-html.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
