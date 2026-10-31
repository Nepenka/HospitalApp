import type { Metadata } from "next";
import "./globals.css";
import { OfflineStatus } from "@/components/offline-status";
import { SiteHeader } from "@/components/site-header";
import { SiteHeaderVisibility } from "@/components/site-header-visibility";
import { LocaleProvider } from "@/i18n/provider";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const metadata: Metadata = locale === "en"
    ? { title: "AnaFix — acute allergic reaction assessment", description: "Clinical decision support for acute allergic reactions and anaphylaxis" }
    : { title: "АнаФикс — оценка острой аллергической реакции", description: "Инструмент поддержки врача при оценке ОАР и анафилаксии" };
  if (process.env.ANAFIX_DEMO_MODE === "true") metadata.robots = { index: false, follow: false };
  return metadata;
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return <html lang={locale}><body><LocaleProvider locale={locale}>{process.env.ANAFIX_DEMO_MODE === "true" && <div className="demoBanner" role="note">{locale === "en" ? "Customer demo · Test data only. Do not enter real patient information." : "Демонстрация для заказчика · Только тестовые данные. Не вводите сведения о реальных пациентах."}</div>}<OfflineStatus /><SiteHeaderVisibility><SiteHeader locale={locale} /></SiteHeaderVisibility>{children}</LocaleProvider></body></html>;
}
