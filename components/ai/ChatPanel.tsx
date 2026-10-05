"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CalendarCheck, Loader2, MessageCircle, RotateCcw, SendHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { resetChat, sendChat, useChat, type ChatBooking } from "@/lib/chat-store";
import { useT } from "@/lib/i18n/client";
import type { UiDict } from "@/lib/i18n/ui";
import { SilkBackground } from "@/components/site/SilkBackground";

export type ChatPanelHandle = { focus: () => void; send: (text: string) => void };

type Props = {
  assistantName: string;
  greeting: string;
  /** link wa.me do salão para "Falar com o salão" */
  salonWhatsappUrl: string;
  onClose?: () => void;
  className?: string;
};

/** Conversa com a assistente (usada na secção Agenda e no botão flutuante). */
export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  { assistantName, greeting, salonWhatsappUrl, onClose, className },
  ref,
) {
  const chat = useChat(greeting);
  const t = useT();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || chat.loading) return;
    setInput("");
    try {
      await sendChat(content);
    } catch {
      setInput(content); // devolve o texto para tentar outra vez
    }
  }

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus({ preventScroll: true }), send }));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, chat.booking, chat.loading]);

  const fresh = chat.messages.length <= 1;
  const suggestions = t.chat.suggestions;

  return (
    <section
      aria-label={`${assistantName} · ${t.chat.assistant}`}
      className={cn(
        "relative isolate flex min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-accent/30 bg-black shadow-2xl",
        className,
      )}
    >
      {/* fundo de seda dourada, escurecido para o texto ler bem */}
      <SilkBackground className="-z-10">
        <div className="absolute inset-0 bg-black/45" />
      </SilkBackground>
      <header className="flex items-center gap-3 border-b border-border px-6 py-5">
        <div className="relative grid size-10 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 font-serif text-lg text-accent">
          {assistantName[0]}
          <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-2xl leading-none">
            {assistantName} <span className="text-muted-foreground">· {t.chat.assistant}</span>
          </p>
          <p className="mt-1 font-label text-[10px] tracking-[0.25em] text-emerald-400/90 uppercase">{t.chat.online}</p>
        </div>
        {!fresh && (
          <button type="button" onClick={resetChat} title={t.chat.restart} className="rounded-full p-2 text-muted-foreground transition hover:text-foreground">
            <RotateCcw className="size-4" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t.chat.close} className="rounded-full p-2 text-muted-foreground transition hover:text-foreground">
            <X className="size-5" />
          </button>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5" aria-live="polite">
        {chat.messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "rounded-br-md bg-accent text-accent-foreground"
                  : "rounded-bl-md border border-border bg-background/60",
              )}
            >
              {m.content}
            </p>
          </div>
        ))}
        {chat.booking && <BookingCard booking={chat.booking} t={t} />}
        {chat.loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t.chat.typing(assistantName)}
          </div>
        )}
      </div>

      {chat.error && <p className="border-t border-border bg-destructive/10 px-6 py-2 text-xs text-destructive">{chat.error}</p>}

      {fresh && !chat.loading && (
        <div className="flex flex-wrap gap-2 px-6 pb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-accent/40 px-3.5 py-1.5 text-xs text-accent transition hover:bg-accent hover:text-accent-foreground"
            >
              {s}
            </button>
          ))}
          <a
            href={salonWhatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition hover:border-accent/40 hover:text-foreground"
          >
            {t.chat.talkToSalon}
          </a>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-border p-4"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={t.chat.placeholder}
          aria-label={t.chat.message}
          className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-accent/60"
        />
        <button
          type="submit"
          disabled={chat.loading || !input.trim()}
          aria-label={t.chat.send}
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground transition hover:brightness-110 disabled:opacity-40"
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </section>
  );
});

function BookingCard({ booking, t }: { booking: ChatBooking; t: UiDict }) {
  const confirmed = booking.status === "confirmed";
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <CalendarCheck className="size-4 text-accent" />
        {confirmed ? t.booking.confirmed : t.booking.pending}
        <span className="ml-auto font-mono text-xs text-muted-foreground">#{booking.code}</span>
      </div>
      <p>{booking.services.join(" + ")}</p>
      <p className="text-muted-foreground first-letter:uppercase">{booking.when}</p>
      {booking.staffName && (
        <p className="text-muted-foreground">
          {t.booking.with} {booking.staffName}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {booking.total > 0 ? `${formatMoney(booking.total)} · ` : ""}
        {t.booking.payAtSalon}
      </p>
      {!confirmed &&
        (booking.confirmationSent ? (
          <p className="mt-3 rounded-lg bg-background/60 p-2 text-xs">
            {t.booking.sentWhatsapp}
          </p>
        ) : (
          booking.confirmUrl && (
            <a
              href={booking.confirmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 font-medium text-white transition hover:brightness-95"
            >
              <MessageCircle className="size-4" /> {t.booking.confirmWhatsapp}
            </a>
          )
        ))}
    </div>
  );
}
