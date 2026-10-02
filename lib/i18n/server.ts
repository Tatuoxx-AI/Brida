import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locales";

/** Língua escolhida neste aparelho (cookie "lang"); português se ainda não escolheu. */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** true se o visitante ainda não escolheu a língua (mostra a janela de escolha). */
export async function hasChosenLocale(): Promise<boolean> {
  return isLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
