"use client";

import { createContext, useContext } from "react";
import { UI, type UiDict } from "./ui";
import { LOCALE_COOKIE, LOCALE_INFO, type Locale } from "./locales";

const Ctx = createContext<Locale>("pt");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);
export const useT = (): UiDict => UI[useContext(Ctx)];
export const useIntl = () => LOCALE_INFO[useContext(Ctx)].intl;

/** Guarda a língua neste aparelho (1 ano). */
export function saveLocale(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
}
