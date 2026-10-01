"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { managerLogout, mgrEvents, mgrMarkEventsRead, type MgrEvent } from "@/actions/manager";
import { AgendaTab } from "./AgendaTab";
import { StatsTab } from "./StatsTab";
import { ClientsTab } from "./ClientsTab";
import { SiteTab } from "./SiteTab";
import { NotesTab } from "./NotesTab";
import { AutomationTab } from "./AutomationTab";
import { LoyaltyTab } from "./LoyaltyTab";
import { AssistantTab } from "./AssistantTab";
import { InstallTab } from "./InstallTab";

const TABS = [
  ["assistente", "Assistente"],
  ["agenda", "Agenda"],
  ["estatisticas", "Estatísticas"],
  ["clientes", "Clientes"],
  ["site", "Editar site"],
  ["notas", "Notas"],
  ["automacao", "Automação"],
  ["fidelidade", "Fidelidade"],
  ["app", "Instalar App"],
] as const;
type Tab = (typeof TABS)[number][0];

export function ManagerApp({ today, whatsappUrl }: { today: string; whatsappUrl: string }) {
  const [tab, setTab] = useState<Tab>("agenda");

  // separador lembrado no endereço (#agenda), sem expor nada
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some(([k]) => k === h)) setTab(h);
  }, []);
  function go(t: Tab) {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  }

  return (
    <div className="min-h-dvh bg-[#0b0a09] text-foreground">
      <header className="sticky top-0 z-30 border-b border-gold/20 bg-[#0b0a09]/90 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-3 px-4 sm:px-8">
          <p className="font-serif text-2xl sm:text-3xl">
            Painel do Studio <span className="ml-1 font-label text-[10px] tracking-[0.25em] text-gold uppercase">· Privado</span>
          </p>
          <Notifications onOpenAgenda={() => go("agenda")} />
          <form action={managerLogout}>
            <button
              type="submit"
              onClick={() => setTimeout(() => window.location.reload(), 300)}
              className="h-10 rounded-full border border-gold/30 px-5 font-label text-[11px] tracking-[0.25em] uppercase transition hover:border-gold"
            >
              Sair
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-4 sm:px-8 [scrollbar-width:none]" aria-label="Secções do painel">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => go(k)}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-5 py-2.5 font-label text-[11px] tracking-[0.15em] transition",
                tab === k ? "border-gold bg-gold text-black" : "border-gold/30 text-foreground/85 hover:border-gold/70",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {tab === "assistente" && <AssistantTab whatsappUrl={whatsappUrl} />}
        {tab === "agenda" && <AgendaTab today={today} />}
        {tab === "estatisticas" && <StatsTab />}
        {tab === "clientes" && <ClientsTab />}
        {tab === "site" && <SiteTab />}
        {tab === "notas" && <NotesTab />}
        {tab === "automacao" && <AutomationTab />}
        {tab === "fidelidade" && <LoyaltyTab />}
        {tab === "app" && <InstallTab />}
      </main>
    </div>
  );
}

/** Sino com as novidades (novas marcações, cancelamentos, fila). Toca um som suave. */
function Notifications({ onOpenAgenda }: { onOpenAgenda: () => void }) {
  const [events, setEvents] = useState<MgrEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const lastTop = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await mgrEvents();
        if (!alive) return;
        const top = r.events[0]?.id ?? 0;
        if (lastTop.current !== null && top > lastTop.current) chime();
        lastTop.current = top;
        setEvents(r.events);
        setUnread(r.unread);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={async () => {
          setOpen((o) => !o);
          if (unread) {
            await mgrMarkEventsRead();
            setUnread(0);
          }
        }}
        aria-label={`Notificações${unread ? ` (${unread} novas)` : ""}`}
        className="relative grid size-10 place-items-center rounded-full border border-gold/30 transition hover:border-gold"
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-black">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gold/25 bg-[#141210] shadow-2xl">
          {events.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Sem novidades.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gold/10 overflow-y-auto">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenAgenda();
                    }}
                    className={cn("block w-full px-4 py-3 text-left hover:bg-white/5", !e.read && "bg-gold/5")}
                  >
                    <p className="text-sm font-medium">{e.title}</p>
                    {e.body && <p className="text-xs text-muted-foreground">{e.body}</p>}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(e.created_at))}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Dois toques suaves (sem ficheiro de som). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
  } catch {}
}
