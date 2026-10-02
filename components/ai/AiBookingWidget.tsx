"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPEN_CHAT_EVENT } from "@/lib/chat-store";
import { ChatPanel, type ChatPanelHandle } from "./ChatPanel";
import { useT } from "@/lib/i18n/client";

const INLINE_ID = "assistente";

/**
 * Botão flutuante da assistente. Na página com a secção Agenda leva o cliente ao
 * chat dessa secção; nas outras páginas abre o chat num painel flutuante.
 * A conversa é a mesma nos dois sítios (lib/chat-store).
 */
export function AiBookingWidget(props: { assistantName: string; greeting: string; salonWhatsappUrl: string }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const panel = useRef<ChatPanelHandle>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      if (document.getElementById(INLINE_ID)) return; // o chat da secção trata disto
      setOpen(true);
      pending.current = (e as CustomEvent<{ message?: string }>).detail?.message ?? null;
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      panel.current?.focus();
      if (pending.current) panel.current?.send(pending.current);
      pending.current = null;
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  function toggle() {
    if (!open && document.getElementById(INLINE_ID)) {
      window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: {} }));
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? t.chat.close : `${t.chat.open} ${props.assistantName}`}
        className={cn(
          "fixed right-4 bottom-4 z-50 flex h-14 items-center gap-2 rounded-full bg-accent px-5 text-accent-foreground shadow-xl transition",
          "hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none",
          open && "max-sm:hidden",
        )}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
        <span className="text-sm font-medium">{open ? t.chat.close : props.assistantName}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 sm:inset-auto sm:right-4 sm:bottom-22 sm:h-[min(620px,calc(100dvh-7rem))] sm:w-[400px]">
          <ChatPanel
            ref={panel}
            {...props}
            onClose={() => setOpen(false)}
            className="h-full rounded-none bg-card sm:rounded-[1.75rem] animate-in fade-in slide-in-from-bottom-4 duration-200"
          />
        </div>
      )}
    </>
  );
}
