"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import styles from "./site-header.module.css";

export function HeaderAccount({ displayName, roleLabel, locale, children }: { displayName: string; roleLabel: string; locale: Locale; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase() || "АФ";
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false; };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  return <details className={styles.account} ref={ref} data-header-account="true">
    <summary aria-label={`${locale === "en" ? "User menu" : "Меню пользователя"}: ${displayName}`}>
      <span className={styles.avatar} aria-hidden="true">{initials}</span>
      <svg className={styles.chevron} aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </summary>
    <div className={styles.accountPanel}><strong>{displayName}</strong><span>{roleLabel}</span>{children}</div>
  </details>;
}
