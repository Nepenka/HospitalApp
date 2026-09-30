import { getLocale } from "@/i18n/server";
import { setLocaleAction } from "@/app/language-actions";
import styles from "./language-switcher.module.css";

export async function LanguageSwitcher() {
  const locale = await getLocale();
  return <div className={styles.switcher} role="group" aria-label={locale === "ru" ? "Язык интерфейса" : "Interface language"}>
    <form action={setLocaleAction}><input type="hidden" name="locale" value="ru" /><button type="submit" data-active={locale === "ru"} aria-pressed={locale === "ru"}>RU</button></form>
    <form action={setLocaleAction}><input type="hidden" name="locale" value="en" /><button type="submit" data-active={locale === "en"} aria-pressed={locale === "en"}>EN</button></form>
  </div>;
}
