"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_INFO, type Locale } from "@/lib/i18n/locales";
import { saveLocale, useLocale, useT } from "@/lib/i18n/client";
import { resetChatGreeting } from "@/lib/chat-store";

export const OPEN_LANG_EVENT = "brida:open-lang";
export const openLanguagePicker = () => window.dispatchEvent(new Event(OPEN_LANG_EVENT));

/** Escolha de idioma: abre sozinha na 1.ª visita deste aparelho e pelo botão do topo. */
export function LanguageGate({ open: initial }: { open: boolean }) {
  const [open, setOpen] = useState(initial);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Locale | null>(null);
  const current = useLocale();
  const t = useT();
  const router = useRouter();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LANG_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LANG_EVENT, onOpen);
  }, []);

  function choose(l: Locale) {
    setPicked(l);
    saveLocale(l);
    resetChatGreeting();
    start(() => {
      router.refresh();
      setOpen(false);
    });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal aria-label={t.langTitle}>
      <div className="w-full max-w-md rounded-t-3xl border border-accent/30 bg-card p-6 shadow-2xl animate-in slide-in-from-bottom-6 fade-in sm:rounded-3xl sm:p-8">
        <p className="text-center font-serif text-3xl">{t.langTitle}</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">{t.langText}</p>
        <ul className="mt-6 space-y-2">
          {LOCALES.map((l) => (
            <li key={l}>
              <button
                type="button"
                lang={l}
                onClick={() => choose(l)}
                disabled={pending}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border px-5 py-3.5 text-left transition",
                  l === current && !initial ? "border-accent bg-accent/10" : "border-border hover:border-accent/60",
                )}
              >
                <span className="text-2xl" aria-hidden>
                  {LOCALE_INFO[l].flag}
                </span>
                <span className="flex-1 text-base">{LOCALE_INFO[l].name}</span>
                {pending && picked === l ? (
                  <Loader2 className="size-4 animate-spin text-accent" />
                ) : (
                  l === current && !initial && <Check className="size-4 text-accent" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
