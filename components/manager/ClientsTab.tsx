"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Gift, MessageCircle, Minus, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone, whatsappLink } from "@/lib/format";
import {
  mgrAddClient,
  mgrAddClientNote,
  mgrAdjustStamps,
  mgrClientDetail,
  mgrClientInvites,
  mgrClients,
  mgrInviteSettings,
  mgrSetClientDiscount,
  mgrSuggestClients,
  type MgrAppointment,
  type MgrClient,
  type MgrInvite,
  type MgrInviteSettings,
  type MgrNote,
  type MgrSuggestion,
} from "@/actions/manager";
import { CLIENT_SORTS, type MgrClientSort, type NoteKind } from "@/types/database";
import { Btn, Card, Empty, Field, STATUS_LABEL, TextArea, inputCls, useFlash } from "./ui";

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "2-digit", timeZone: "Europe/Lisbon" }).format(new Date(iso)) : "—";

const ORDENS: Record<MgrClientSort, string> = { nome: "Nome", ultima: "Última visita", visitas: "Nº de visitas" };

export function ClientsTab() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<MgrClientSort>("nome");
  const [rows, setRows] = useState<MgrClient[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", birth_date: "" });
  const [cfg, setCfg] = useState<MgrInviteSettings | null>(null);
  const flash = useFlash();

  const load = useCallback(() => {
    mgrClients(search, sort).then(setRows);
  }, [search, sort]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    mgrInviteSettings().then(setCfg);
  }, []);

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

      <BuscaComSugestoes
        valor={search}
        onValor={setSearch}
        onEscolher={(s) => {
          setSearch(s.name);
          setOpen(s.id);
        }}
        onCriar={(nome) => setForm((f) => ({ ...f, name: nome }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-label text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Ordenar</span>
        {CLIENT_SORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            aria-pressed={sort === s}
            className={cn(
              "min-h-9 rounded-full border px-4 text-xs transition",
              sort === s ? "border-gold bg-gold/15 text-gold" : "border-gold/25 text-muted-foreground hover:border-gold/60",
            )}
          >
            {ORDENS[s]}
          </button>
        ))}
      </div>

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
                {Number(c.discount) > 0 && (
                  <span className="shrink-0 rounded-full border border-emerald-400/40 px-2.5 py-0.5 text-xs text-emerald-300" title="Desconto de convites">
                    −{Number(c.discount)}%
                  </span>
                )}
                <span className="shrink-0 rounded-full border border-gold/30 px-2.5 py-0.5 text-xs text-gold">{c.stamps} ✦</span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open === c.id && "rotate-180")} />
              </button>
              {open === c.id && <ClientDetail client={c} cfg={cfg} onChange={load} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Busca com sugestões em tempo real.
 *
 * Cada sugestão traz os três últimos dígitos do telefone e a última visita: num
 * salão há sempre duas Anas, e sem isso não há como escolher a certa. Se não
 * houver ninguém parecido, oferece criar a ficha com o nome já escrito.
 */
function BuscaComSugestoes({
  valor,
  onValor,
  onEscolher,
  onCriar,
}: {
  valor: string;
  onValor: (v: string) => void;
  onEscolher: (s: MgrSuggestion) => void;
  onCriar: (nome: string) => void;
}) {
  const [sugestoes, setSugestoes] = useState<MgrSuggestion[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (valor.trim().length < 2) {
      setSugestoes(null);
      return;
    }
    const t = setTimeout(() => {
      mgrSuggestClients(valor).then(setSugestoes);
    }, 180);
    return () => clearTimeout(t);
  }, [valor]);

  // Fechar ao tocar fora (no telemóvel a lista tapava a lista de clientes).
  useEffect(() => {
    const fora = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, []);

  return (
    <div ref={caixa} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={valor}
        onChange={(e) => {
          onValor(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        placeholder="Procurar por nome, telefone ou e-mail…"
        aria-label="Procurar clientes"
        className={cn(inputCls, "bg-[#141210] pl-11")}
      />

      {aberto && sugestoes !== null && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-gold/30 bg-[#191714] shadow-2xl">
          {sugestoes.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                onCriar(valor.trim());
                setAberto(false);
              }}
              className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm text-gold"
            >
              <Plus className="size-4" /> Criar nova cliente “{valor.trim()}”
            </button>
          ) : (
            <ul>
              {sugestoes.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onEscolher(s);
                      setAberto(false);
                    }}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-gold/10"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.phoneTail ? `…${s.phoneTail}` : "sem tel."} · {s.lastVisit ? fmtDate(s.lastVisit) : "sem visitas"}
                    </span>
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

function ClientDetail({ client, cfg, onChange }: { client: MgrClient; cfg: MgrInviteSettings | null; onChange: () => void }) {
  const [data, setData] = useState<{ notes: MgrNote[]; history: MgrAppointment[] } | null>(null);
  const [invites, setInvites] = useState<MgrInvite[] | null>(null);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<NoteKind>("tecnica");
  const [desconto, setDesconto] = useState(String(Number(client.discount ?? 0)));
  const flash = useFlash();
  const load = useCallback(() => {
    mgrClientDetail(client.id).then(setData);
    mgrClientInvites(client.id).then(setInvites);
  }, [client.id]);
  useEffect(load, [load]);

  const degraus = cfg?.steps ?? 10;
  const passo = cfg?.step ?? 5;
  const teto = cfg?.max ?? 50;

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

      {/* ----------------------------------------------------------- convites */}
      <div>
        <p className="mb-2 flex items-center gap-2 font-label text-[11px] tracking-[0.2em] text-gold uppercase">
          <Gift className="size-3.5" /> Convites
        </p>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          {client.invite_code && (
            <div className="mx-auto w-28 sm:mx-0">
              <div className="rounded-xl bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/convite/${client.invite_code}/qr`} alt={`QR do convite de ${client.name}`} width={200} height={200} className="block w-full" />
              </div>
              <p className="mt-1 text-center font-mono text-[11px] tracking-widest text-gold">{client.invite_code}</p>
            </div>
          )}
          <div className="space-y-3">
            <p className="text-sm">
              Nível <b className="text-gold">{client.invite_level}</b> de {degraus} ·{" "}
              <span className={cn(Number(client.discount) > 0 && "text-emerald-300")}>desconto {Number(client.discount)}%</span>
              {client.discount_manual && <span className="ml-2 text-xs text-amber-300">(fixado à mão)</span>}
            </p>
            <ol className="flex gap-1" aria-label="Escada de convites">
              {Array.from({ length: degraus }, (_, i) => i + 1).map((d) => (
                <li
                  key={d}
                  title={`${d} convidada(s) → ${Math.min(teto, d * passo)}%`}
                  className={cn(
                    "h-6 flex-1 rounded border text-center text-[9px] leading-6",
                    d <= client.invite_level ? "border-gold/60 bg-gold/25 text-gold" : "border-gold/15 text-muted-foreground/40",
                  )}
                >
                  {Math.min(teto, d * passo)}
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground">
                Desconto à mão
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  className="ml-2 h-9 w-20 rounded-full border border-gold/25 bg-black/40 px-3 text-sm text-foreground"
                />
              </label>
              <Btn
                variant="ghost"
                className="h-9 px-4"
                onClick={async () => {
                  flash.show(await mgrSetClientDiscount(client.id, Number(desconto)), "Desconto fixado ✓");
                  onChange();
                }}
              >
                Fixar
              </Btn>
              {client.discount_manual && (
                <Btn
                  variant="ghost"
                  className="h-9 px-4"
                  onClick={async () => {
                    flash.show(await mgrSetClientDiscount(client.id, null), "Voltou à escada ✓");
                    onChange();
                  }}
                >
                  Voltar à escada
                </Btn>
              )}
            </div>

            {invites && invites.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-3">
                    <span className="flex-1">{i.invitee}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(i.created_at)}</span>
                    <span className={cn("text-xs", i.status === "valid" ? "text-emerald-300" : "text-amber-300")}>
                      {i.status === "valid" ? "✓ válida" : i.status === "blocked" ? "bloqueada" : "à espera da 1.ª visita"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não convidou ninguém.</p>
            )}
          </div>
        </div>
      </div>

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
