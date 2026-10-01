"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, MessageCircle, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone, whatsappLink } from "@/lib/format";
import {
  mgrAddClient,
  mgrAddClientNote,
  mgrAdjustStamps,
  mgrClientDetail,
  mgrClients,
  type MgrAppointment,
  type MgrClient,
  type MgrNote,
} from "@/actions/manager";
import type { NoteKind } from "@/types/database";
import { Btn, Card, Empty, Field, STATUS_LABEL, TextArea, inputCls, useFlash } from "./ui";

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "2-digit", timeZone: "Europe/Lisbon" }).format(new Date(iso)) : "—";

export function ClientsTab() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MgrClient[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", birth_date: "" });
  const flash = useFlash();

  const load = useCallback(() => {
    mgrClients(search).then(setRows);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await mgrAddClient(form);
            flash.show(r, "Cliente adicionada ✓");
            if (r.ok) {
              setForm({ name: "", phone: "", email: "", birth_date: "" });
              load();
            }
          }}
        >
          <Field placeholder="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field placeholder="Telefone" type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field placeholder="E-mail (opcional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Field
              type="date"
              aria-label="Data de nascimento (opcional, para a mensagem de aniversário)"
              title="Data de nascimento (opcional)"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Btn type="submit" variant="ghost" className="border-dashed">
              Adicionar cliente
            </Btn>
            {flash.node}
          </div>
        </form>
      </Card>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Procurar por nome ou telefone…"
        aria-label="Procurar clientes"
        className={cn(inputCls, "bg-[#141210]")}
      />

      {rows === null ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : rows.length === 0 ? (
        <Empty>{search ? "Nenhuma cliente encontrada." : "Ainda sem clientes registadas."}</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-2xl border border-gold/15 bg-[#141210]">
              <button
                type="button"
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                className="flex w-full items-center gap-4 px-5 py-4 text-left"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-gold/30 font-serif text-lg text-gold">{c.name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.phone ? formatPhone(c.phone) : "sem telefone"} · {c.visits} visita(s) · última {fmtDate(c.last_visit)}
                    {c.next_visit && <span className="text-gold"> · próxima {fmtDate(c.next_visit)}</span>}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-gold/30 px-2.5 py-0.5 text-xs text-gold">{c.stamps} ✦</span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open === c.id && "rotate-180")} />
              </button>
              {open === c.id && <ClientDetail client={c} onChange={load} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientDetail({ client, onChange }: { client: MgrClient; onChange: () => void }) {
  const [data, setData] = useState<{ notes: MgrNote[]; history: MgrAppointment[] } | null>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<NoteKind>("tecnica");
  const flash = useFlash();
  const load = useCallback(() => {
    mgrClientDetail(client.id).then(setData);
  }, [client.id]);
  useEffect(load, [load]);

  return (
    <div className="space-y-5 border-t border-gold/10 px-5 pt-4 pb-5">
      <div className="flex flex-wrap items-center gap-2">
        {client.phone && (
          <a
            href={whatsappLink(client.phone, `Olá ${client.name.split(" ")[0]}! `)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-400/30 px-4 text-xs text-emerald-300 hover:border-emerald-400/70"
          >
            <MessageCircle className="size-3.5" /> Conversar no WhatsApp
          </a>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Carimbos:</span>
        {[-1, 1].map((d) => (
          <button
            key={d}
            type="button"
            aria-label={d > 0 ? "Dar carimbo" : "Tirar carimbo"}
            onClick={async () => {
              flash.show(await mgrAdjustStamps(client.id, d), d > 0 ? "Carimbo dado ✓" : "Carimbo retirado ✓");
              onChange();
            }}
            className="grid size-9 place-items-center rounded-full border border-gold/30 text-gold hover:border-gold"
          >
            {d > 0 ? <Plus className="size-4" /> : <Minus className="size-4" />}
          </button>
        ))}
      </div>
      {flash.node}

      <div>
        <p className="mb-2 font-label text-[11px] tracking-[0.2em] text-gold uppercase">Notas técnicas</p>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await mgrAddClientNote(client.id, note, kind);
            flash.show(r, "Nota guardada ✓");
            if (r.ok) {
              setNote("");
              load();
            }
          }}
        >
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: Fórmula — Koleston 7/1 + 20 vol 1:1, pausa 35 min. Couro cabeludo sensível."
            className="[&_textarea]:min-h-20"
          />
          <div className="flex items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)} className="h-9 rounded-full border border-gold/25 bg-black/40 px-3 text-xs">
              <option value="tecnica">Fórmula / técnica</option>
              <option value="alergia">Alergia</option>
              <option value="geral">Geral</option>
            </select>
            <Btn type="submit" className="h-9 px-4">
              Guardar nota
            </Btn>
          </div>
        </form>
        <ul className="mt-3 space-y-2">
          {data?.notes.map((n) => (
            <li key={n.id} className={cn("rounded-xl border bg-black/30 p-3 text-sm", n.kind === "alergia" ? "border-red-400/40" : "border-gold/10")}>
              <span className="mb-1 block text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {n.kind === "tecnica" ? "Fórmula / técnica" : n.kind === "alergia" ? "⚠ Alergia" : "Geral"} · {fmtDate(n.created_at)}
              </span>
              <span className="whitespace-pre-wrap">{n.content}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 font-label text-[11px] tracking-[0.2em] text-gold uppercase">Histórico</p>
        {!data?.history.length ? (
          <p className="text-sm text-muted-foreground">Sem marcações.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.history.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <span className="w-24 text-muted-foreground tabular-nums">
                  {a.date.split("-").reverse().join("/")} {a.time}
                </span>
                <span className="flex-1">{a.services}</span>
                <span className={cn("text-xs", STATUS_LABEL[a.status]?.cls.split(" ").find((c) => c.startsWith("text-")))}>
                  {STATUS_LABEL[a.status]?.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
