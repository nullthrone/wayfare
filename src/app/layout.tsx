import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ToastProvider } from "@/components/ui/Toast";
import { getInstanceSettings } from "@/server/services/admin";
import "./globals.css";
import "@/themes/fonts.css";
import "@/themes/frames.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const settings = await getInstanceSettings().catch(() => null);
  const name = settings?.instanceName || "Wayfare";
  return {
    title: { default: `${name} – ${t("tagline")}`, template: `%s · ${name}` },
    description: t("description"),
    applicationName: name,
  };
}

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
