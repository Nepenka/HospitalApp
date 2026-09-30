import type { Metadata } from "next";
import "./globals.css";
import { OfflineStatus } from "@/components/offline-status";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LocaleProvider } from "@/i18n/provider";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === "en"
    ? { title: "AnaFix — acute allergic reaction assessment", description: "Clinical decision support for acute allergic reactions and anaphylaxis" }
    : { title: "АнаФикс — оценка острой аллергической реакции", description: "Инструмент поддержки врача при оценке ОАР и анафилаксии" };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return <html lang={locale}><body><LocaleProvider locale={locale}><OfflineStatus /><LanguageSwitcher />{children}</LocaleProvider></body></html>;
}
