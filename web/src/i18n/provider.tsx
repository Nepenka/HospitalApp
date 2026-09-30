"use client";

import { createContext, useContext } from "react";
import { translate, type Locale } from "./config";

const LocaleContext = createContext<Locale>("ru");
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) { return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>; }
export function useLocale(): Locale { return useContext(LocaleContext); }
export function useTranslations() { const locale = useLocale(); return { locale, t: (text: string) => translate(locale, text) }; }
