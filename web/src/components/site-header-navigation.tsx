"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import styles from "./site-header.module.css";

export type HeaderLink = { href: string; label: string; exact?: boolean; fullNavigation?: boolean };
export function HeaderNavigation({ links, locale }: { links: HeaderLink[]; locale: Locale }) {
  const pathname = usePathname();
  return <nav className={styles.navigation} aria-label={locale === "en" ? "Main navigation" : "Основная навигация"}>
    {links.map((link) => {
      const active = pathname === link.href || (!link.exact && pathname.startsWith(`${link.href}/`));
      const attributes = { className: styles.navLink, "aria-current": active ? "page" as const : undefined };
      return link.fullNavigation ? <a key={link.href} href={link.href} {...attributes}>{link.label}</a> : <Link key={link.href} href={link.href} {...attributes}>{link.label}</Link>;
    })}
  </nav>;
}
