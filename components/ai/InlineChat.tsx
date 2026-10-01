"use client";

import { useEffect, useRef } from "react";
import { OPEN_CHAT_EVENT } from "@/lib/chat-store";
import { ChatPanel, type ChatPanelHandle } from "./ChatPanel";

/** Chat da secção Agenda. Responde aos botões "Marcar"/"Ver vagas" do resto do site. */
export function InlineChat(props: { assistantName: string; greeting: string; salonWhatsappUrl: string; className?: string }) {
  const panel = useRef<ChatPanelHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message;
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        panel.current?.focus();
        if (message) panel.current?.send(message);
      }, 400);
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
  }, []);

  return (
    <div id="assistente" ref={wrap} className={props.className}>
      <ChatPanel ref={panel} {...props} className="h-full" />
    </div>
  );
}
