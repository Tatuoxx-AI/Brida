"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { whatsappLink } from "@/lib/format";
import {
  mgrBlockDay,
  mgrBlockedDays,
  mgrCreateAppointment,
  mgrDay,
  mgrMonth,
  mgrPending,
  mgrSetStatus,
  mgrSiteData,
  mgrUnblock,
  type MgrAppointment,
  type MgrDayCount,
  type MgrService,
  type MgrStaff,
} from "@/actions/manager";
import type { AppointmentStatus } from "@/types/database";
import { Btn, Card, Empty, Field, H2, Label, STATUS_LABEL, inputCls, useFlash } from "./ui";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

export function AgendaTab({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [counts, setCounts] = useState<MgrDayCount[]>([]);
  const [day, setDay] = useState(today);
  const [list, setList] = useState<MgrAppointment[]>([]);
  const [pending, setPending] = useState<MgrAppointment[]>([]);
  const [blocked, setBlocked] = useState<{ id: string; date: string; reason: string | null }[]>([]);
  const [, start] = useTransition();
  const flash = useFlash();

  const refresh = useCallback(() => {
    start(async () => {
      const [c, l, p, b] = await Promise.all([mgrMonth(month), mgrDay(day), mgrPending(), mgrBlockedDays()]);
      setCounts(c);
      setList(l);
      setPending(p);
      setBlocked(b);
    });
  }, [month, day]);

  useEffect(refresh, [refresh]);
  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function setStatus(id: string, status: AppointmentStatus) {
    const r = await mgrSetStatus(id, status);
    flash.show(r, "Atualizado ✓");
    refresh();
  }

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const dayInfo = counts.find((c) => c.date === day);
  const blockedEntry = blocked.find((b) => b.date === day);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        {/* mês */}
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMonth(`${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`)}
              className="grid size-9 place-items-center rounded-full border border-gold/30 text-gold hover:border-gold"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="font-serif text-2xl">
              {MONTHS[m - 1]} {y}
            </p>
            <button
              type="button"
              aria-label="Mês seguinte"
              onClick={() => setMonth(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`)}
              className="grid size-9 place-items-center rounded-full border border-gold/30 text-gold hover:border-gold"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {WEEK.map((w) => (
              <span key={w} className="pb-1 font-label text-[10px] tracking-[0.15em] text-gold">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const iso = `${month}-${String(d).padStart(2, "0")}`;
              const c = counts.find((x) => x.date === iso);
              const selected = iso === day;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setDay(iso)}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition",
                    selected ? "border-gold bg-gold/10" : "border-gold/15 bg-black/30 hover:border-gold/50",
                    iso === today && !selected && "border-gold/60",
                    c?.blocked && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.05)_6px_8px)] text-muted-foreground",
                  )}
                >
                  {d}
                  {!!c?.total && (
                    <span className={cn("mt-0.5 text-[10px]", c.pending ? "text-amber-300" : "text-gold")}>
                      {c.total} {c.pending ? `· ${c.pending}!` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Número = marcações do dia · <span className="text-amber-300">!</span> = por confirmar · riscado = dia bloqueado
          </p>
        </Card>

        {/* por confirmar */}
        <Card>
          <H2>Por confirmar</H2>
          <p className="mt-1 text-sm text-muted-foreground">Marcações do site e da assistente à espera de confirmação por WhatsApp.</p>
          {pending.length === 0 ? (
            <Empty>Nada pendente. 🎉</Empty>
          ) : (
            <ul className="mt-4 divide-y divide-gold/10">
              {pending.map((a) => (
                <PendingRow key={a.id} a={a} onStatus={setStatus} />
              ))}
            </ul>
          )}
        </Card>

        <BlockedDays blocked={blocked} onChange={refresh} />
      </div>

      {/* dia */}
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <H2>
              {new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}
            </H2>
            {blockedEntry ? (
              <Btn variant="ghost" onClick={async () => (await mgrUnblock(blockedEntry.id), refresh())}>
                Desbloquear dia
              </Btn>
            ) : (
              <Btn
                variant="ghost"
                onClick={async () => {
                  const reason = prompt("Motivo do bloqueio (ex.: férias, formação):") ?? "";
                  flash.show(await mgrBlockDay(day, reason), "Dia bloqueado ✓");
                  refresh();
                }}
              >
                Bloquear dia
              </Btn>
            )}
          </div>
          {dayInfo?.blocked && <p className="mt-2 text-sm text-amber-300">Dia bloqueado{blockedEntry?.reason ? `: ${blockedEntry.reason}` : ""}. O site não aceita marcações.</p>}
          <div className="mt-2">{flash.node}</div>

          {list.length === 0 ? (
            <Empty>Sem marcações neste dia.</Empty>
          ) : (
            <ul className="mt-4 space-y-3">
              {list.map((a) => (
                <li key={a.id} className={cn("rounded-xl border border-gold/15 bg-black/30 p-4", a.status === "cancelled" && "opacity-50")}>
                  <div className="flex flex-wrap items-start gap-3">
                    <p className="font-serif text-xl tabular-nums text-gold">
                      {a.time}
                      <span className="text-sm text-muted-foreground">–{a.end_time}</span>
                    </p>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.client}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.services} · {a.staff}
                      </p>
                      {a.notes && <p className="mt-1 text-xs text-muted-foreground italic">“{a.notes}”</p>}
                    </div>
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", STATUS_LABEL[a.status]?.cls)}>{STATUS_LABEL[a.status]?.text}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={a.status}
                      onChange={(e) => setStatus(a.id, e.target.value as AppointmentStatus)}
                      aria-label="Estado"
                      className="h-9 rounded-full border border-gold/25 bg-black/40 px-3 text-xs outline-none"
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.text}
                        </option>
                      ))}
                    </select>
                    {a.phone && (
                      <a
                        href={whatsappLink(a.phone, `Olá ${a.client.split(" ")[0]}! `)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-400/30 px-3 text-xs text-emerald-300 hover:border-emerald-400/70"
                      >
                        <MessageCircle className="size-3.5" /> WhatsApp
                      </a>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">#{a.code}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <NewAppointment date={day} onDone={refresh} />
      </div>
    </div>
  );
}

function PendingRow({ a, onStatus }: { a: MgrAppointment; onStatus: (id: string, s: AppointmentStatus) => void }) {
  const when = new Intl.DateTimeFormat("pt-PT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${a.date}T12:00:00Z`));
  const msg = `Olá ${a.client.split(" ")[0]}! Confirmamos a sua marcação no Brida Coiffeur: ${a.services}, ${when} às ${a.time}. Até breve! (#${a.code})`;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {a.client} <span className="text-sm text-muted-foreground">· {a.phone ?? "sem telefone"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {when} às {a.time} · {a.services}
        </p>
      </div>
      {a.phone && (
        <a
          href={whatsappLink(a.phone, msg)}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir conversa com a mensagem de confirmação"
          className="grid size-9 place-items-center rounded-full border border-emerald-400/30 text-emerald-300 hover:border-emerald-400/70"
        >
          <MessageCircle className="size-4" />
        </a>
      )}
      <Btn className="h-9 px-4" onClick={() => onStatus(a.id, "confirmed")}>
        Confirmar
      </Btn>
      <Btn variant="danger" className="h-9 px-4" onClick={() => confirm("Cancelar esta marcação?") && onStatus(a.id, "cancelled")}>
        Cancelar
      </Btn>
    </li>
  );
}

function BlockedDays({ blocked, onChange }: { blocked: { id: string; date: string; reason: string | null }[]; onChange: () => void }) {
  return (
    <Card>
      <Label>Dias bloqueados</Label>
      {blocked.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum dia bloqueado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {blocked.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {new Intl.DateTimeFormat("pt-PT", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${b.date}T12:00:00Z`))}
                {b.reason && <span className="text-muted-foreground"> · {b.reason}</span>}
              </span>
              <button type="button" className="text-xs text-gold hover:underline" onClick={async () => (await mgrUnblock(b.id), onChange())}>
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NewAppointment({ date, onDone }: { date: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<MgrService[]>([]);
  const [staff, setStaff] = useState<MgrStaff[]>([]);
  const [f, setF] = useState({ serviceId: "", staffId: "", time: "10:00", name: "", phone: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const flash = useFlash();

  useEffect(() => {
    if (!open || services.length) return;
    mgrSiteData().then((d) => {
      const sv = d.services.filter((s) => s.active && !s.is_addon);
      const st = d.staff.filter((s) => s.active);
      setServices(sv);
      setStaff(st);
      setF((x) => ({ ...x, serviceId: sv[0]?.id ?? "", staffId: st[0]?.id ?? "" }));
    });
  }, [open, services.length]);

  if (!open) {
    return (
      <Btn variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nova marcação neste dia
      </Btn>
    );
  }

  return (
    <Card>
      <H2>Nova marcação</H2>
      <p className="mt-1 text-sm text-muted-foreground">Feita pelo salão (telefone ou balcão): fica logo confirmada.</p>
      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await mgrCreateAppointment({ ...f, date });
          setBusy(false);
          flash.show(r, "Marcação criada ✓");
          if (r.ok) {
            setF((x) => ({ ...x, name: "", phone: "", notes: "" }));
            onDone();
          }
        }}
      >
        <label className="block">
          <Label>Serviço</Label>
          <select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })} className={inputCls}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_minutes} min
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Profissional</Label>
          <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} className={inputCls}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Field label={`Hora (${date.slice(8)}/${date.slice(5, 7)})`} type="time" step={900} required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        <Field label="Telefone" type="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Field label="Nome" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="sm:col-span-2" />
        <Field label="Observações" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="sm:col-span-2" />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Btn type="submit" disabled={busy}>
            Criar marcação
          </Btn>
          <Btn onClick={() => setOpen(false)} variant="ghost">
            Fechar
          </Btn>
          {flash.node}
        </div>
      </form>
    </Card>
  );
}
