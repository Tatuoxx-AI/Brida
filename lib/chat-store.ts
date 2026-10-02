"use client";

import { useEffect, useSyncExternalStore } from "react";

// Conversa com a assistente, partilhada entre o chat da secção Agenda e o botão
// flutuante: é a mesma conversa, esteja onde estiver. Guardada em sessionStorage
// para sobreviver à navegação (mas não fica para sempre).

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type ChatBooking = {
  code: string;
  services: string[];
  when: string;
  staffName: string;
  total: number;
  status: "pending" | "confirmed";
  confirmUrl: string | null;
  confirmationSent: boolean;
};
type State = { messages: ChatMsg[]; booking: ChatBooking | null; loading: boolean; error: string | null };

const KEY = "brida-chat-v2";
let greeting = "";
let state: State = { messages: [], booking: null, loading: false, error: null };
const listeners = new Set<() => void>();
const SERVER: State = { messages: [], booking: null, loading: false, error: null };

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ messages: state.messages, booking: state.booking }));
  } catch {}
  listeners.forEach((l) => l());
}

function init(g: string) {
  if (greeting === g) return;
  greeting = g;
  let saved: Partial<State> | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {}
  set({
    messages: saved?.messages?.length ? saved.messages : [{ role: "assistant", content: g }],
    booking: saved?.booking ?? null,
  });
}

export async function sendChat(text: string) {
  const content = text.trim();
  if (!content || state.loading) return;
  const next: ChatMsg[] = [...state.messages, { role: "user", content }];
  set({ messages: next, loading: true, error: null });
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // a saudação é só visual; o histórico enviado começa na 1.ª mensagem real
      body: JSON.stringify({ messages: next.filter((m) => m.content !== greeting).slice(-30) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha na assistente.");
    set({ messages: [...state.messages, { role: "assistant", content: data.reply }], booking: data.booking ?? state.booking });
  } catch (e) {
    set({ messages: state.messages.slice(0, -1), error: e instanceof Error ? e.message : "Falha na assistente." });
    throw e;
  } finally {
    set({ loading: false });
  }
}

/** Ao mudar de idioma: a próxima conversa começa com a saudação nova. */
export function resetChatGreeting() {
  greeting = "";
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
  state = { messages: [], booking: null, loading: false, error: null };
  listeners.forEach((l) => l());
}

export function resetChat() {
  set({ messages: [{ role: "assistant", content: greeting }], booking: null, error: null });
}

export function useChat(initialGreeting: string) {
  useEffect(() => init(initialGreeting), [initialGreeting]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}

// ---------------------------------------------------------------------------
// Abrir o chat a partir de qualquer botão do site
export const OPEN_CHAT_EVENT = "brida:open-chat";

/** Leva o cliente ao chat (o da secção Agenda, se existir; senão o flutuante). */
export function openChat(message?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { message } }));
}
