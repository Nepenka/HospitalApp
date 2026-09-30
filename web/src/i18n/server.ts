import "server-only";
import { cookies } from "next/headers";
import { defaultLocale, type Locale } from "./config";

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("anafix-locale")?.value === "en" ? "en" : defaultLocale;
}
