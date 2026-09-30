import type { MetadataRoute } from "next";
import { getLocale } from "@/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale();
  return { name: locale === "en" ? "AnaFix" : "АнаФикс", short_name: locale === "en" ? "AnaFix" : "АнаФикс", description: locale === "en" ? "Clinical decision support for acute allergic reaction assessment" : "Клиническая поддержка при оценке острой аллергической реакции", start_url: "/", display: "standalone", background_color: "#f3f6f5", theme_color: "#087f68", lang: locale };
}
