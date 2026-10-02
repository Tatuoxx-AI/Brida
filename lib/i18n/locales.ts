export const LOCALES = ["pt", "en", "fr", "es", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt";
export const LOCALE_COOKIE = "lang";

export const LOCALE_INFO: Record<Locale, { name: string; flag: string; intl: string; aiName: string }> = {
  pt: { name: "Português", flag: "🇵🇹", intl: "pt-PT", aiName: "português de Portugal" },
  en: { name: "English", flag: "🇬🇧", intl: "en-GB", aiName: "English" },
  fr: { name: "Français", flag: "🇫🇷", intl: "fr-FR", aiName: "French" },
  es: { name: "Español", flag: "🇪🇸", intl: "es-ES", aiName: "Spanish" },
  de: { name: "Deutsch", flag: "🇩🇪", intl: "de-DE", aiName: "German" },
};

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
