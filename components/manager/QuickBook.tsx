"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { mgrConfirmDraft, mgrFindClients, mgrPrepareDraft, type ClienteEncontrada } from "@/actions/assistant";
import { mgrSiteData, type MgrService, type MgrStaff } from "@/actions/manager";
import { getWeekSlots, type AgendaSlot } from "@/actions/agenda";
import type { Proposta } from "@/lib/ai/manager-agent";
import { Btn, Card, inputCls, useFlash } from "./ui";

/**
 * Marcar depressa — sem IA, sem gastar créditos.
 *
 * Um formulário guiado de cima para baixo: escrever (ou ditar) o nome e a lista
 * de clientes vai-se filtrando a cada letra (ignora acentos e aceita erros);
 * depois serviço, profissional, dia e uma das horas livres. O cartão de
 * confirmação continua obrigatório: nada fica na agenda sem o toque em Confirmar.
 */

const TZ = "Europe/Lisbon";
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaCurto = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "2-digit", timeZone: TZ }).format(new Date(iso)) : null;

type Reconhecimento = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const criarReconhecimento = (): Reconhecimento | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecimento; webkitSpeechRecognition?: new () => Reconhecimento };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
};

/** Título de cada passo, com o número dourado à esquerda. */
const Passo = ({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) => (
  <div className="space-y-2.5">
    <p className="flex items-center gap-2 font-label text-[11px] tracking-[0.2em] text-gold uppercase">
      <span className="grid size-5 place-items-center rounded-full border border-gold/50 text-[10px]">{n}</span>
      {titulo}
    </p>
    {children}
  </div>
);

const Pilula = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={cn(
      "min-h-10 rounded-full border px-4 text-sm transition",
      on ? "border-gold bg-gold text-black" : "border-gold/25 text-muted-foreground hover:border-gold/60 hover:text-foreground",
    )}
  >
    {children}
  </button>
);

export function QuickBook() {
  const [catalogo, setCatalogo] = useState<{ services: MgrService[]; staff: MgrStaff[] } | null>(null);
  // 1. cliente
  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<ClienteEncontrada[] | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [cliente, setCliente] = useState<ClienteEncontrada | null>(null);
  const [nova, setNova] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [aOuvir, setAOuvir] = useState(false);
  const [temVoz, setTemVoz] = useState(false);
  const rec = useRef<Reconhecimento | null>(null);
  // 2–5. marcação
  const [servicos, setServicos] = useState<string[]>([]);
  const [profissional, setProfissional] = useState<string | null>(null);
  const [data, setData] = useState(hojeIso);
  const [horas, setHoras] = useState<AgendaSlot[] | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  // confirmação
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const flash = useFlash();

  useEffect(() => {
    mgrSiteData().then((d) => setCatalogo({ services: d.services.filter((s) => s.active), staff: d.staff.filter((s) => s.active) }));
    setTemVoz(!!criarReconhecimento());
  }, []);

  // procura a cada letra (com uma pausa curta para não disparar a cada tecla)
  useEffect(() => {
    if (cliente || nova) return;
    const t = termo.trim();
    if (!t) return setAchadas(null);
    setProcurando(true);
    const id = setTimeout(() => {
      mgrFindClients(t)
        .then(setAchadas)
        .finally(() => setProcurando(false));
    }, 180);
    return () => clearTimeout(id);
  }, [termo, cliente, nova]);

  // horas livres do dia para o serviço e profissional escolhidos
  useEffect(() => {
    setHora(null);
    if (!servicos.length || !data) return setHoras(null);
    let vivo = true;
    setHoras(null);
    getWeekSlots(data, 1, servicos, profissional).then((d) => vivo && setHoras(d[0]?.slots ?? []));
    return () => {
      vivo = false;
    };
  }, [servicos, profissional, data]);

  // ------------------------------------------------------------ ditar o nome
  function ditar() {
    if (aOuvir) {
      rec.current?.stop();
      return;
    }
    const r = criarReconhecimento();
    if (!r) return;
    r.lang = navigator.language?.startsWith("pt") ? navigator.language : "pt-PT";
    r.interimResults = true;
    r.onresult = (e) => {
      const dito = Array.from(e.results, (x) => x[0].transcript).join(" ").trim();
      setCliente(null);
      setNova(false);
      setTermo(dito.replace(/[.!?]$/, ""));
    };
    r.onend = () => setAOuvir(false);
    r.onerror = () => setAOuvir(false);
    rec.current = r;
    r.start();
    setAOuvir(true);
  }

  const escolher = (c: ClienteEncontrada) => {
    setCliente(c);
    setNova(false);
    setTermo(c.name);
    setAchadas(null);
  };
  const trocarCliente = () => {
    setCliente(null);
    setNova(false);
    setTelefone("");
    setTermo("");
    setAchadas(null);
  };

  const nomeOk = cliente ? true : nova && termo.trim().length >= 2 && telefone.replace(/\D/g, "").length >= 9;
  const pronto = nomeOk && servicos.length > 0 && !!hora;
  const servicosAtivos = useMemo(() => catalogo?.services ?? [], [catalogo]);

  async function rever() {
    if (!pronto || !hora) return;
    setOcupado(true);
    try {
      const r = await mgrPrepareDraft({
        clienteId: cliente?.id ?? null,
        nome: cliente?.name ?? termo.trim(),
        telefone: cliente ? null : telefone,
        servicosIds: servicos,
        data,
        hora,
        profissionalId: profissional,
        notas: notas.trim() || null,
      });
      if ("erro" in r) flash.show({ ok: false, error: r.erro });
      else if (r.proposta) setProposta(r.proposta);
      else flash.show({ ok: false, error: r.reply || "Essa hora já não está livre." });
    } finally {
      setOcupado(false);
    }
  }

  function recomecar() {
    trocarCliente();
    setServicos([]);
    setProfissional(null);
    setData(hojeIso());
    setNotas("");
    setProposta(null);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-6">
        {/* 1. cliente */}
        <Passo n={1} titulo="Cliente">
          {cliente ? (
            <div className="flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3">
              <Check className="size-4 shrink-0 text-gold" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{cliente.name}</span>
                <span className="text-xs text-muted-foreground">
                  {cliente.phone ?? "sem telefone"} · {cliente.visits} {cliente.visits === 1 ? "visita" : "visitas"}
                </span>
              </span>
              <button type="button" onClick={trocarCliente} className="text-xs text-gold hover:underline">
                trocar
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={termo}
                    onChange={(e) => {
                      setTermo(e.target.value);
                      setNova(false);
                    }}
                    placeholder="Nome ou telefone da cliente"
                    aria-label="Procurar cliente"
                    autoComplete="off"
                    className={cn(inputCls, "min-h-14 pl-11", aOuvir && "border-red-400/60")}
                  />
                  {procurando && <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-gold" />}
                </div>
                {temVoz && (
                  <button
                    type="button"
                    onClick={ditar}
                    aria-label={aOuvir ? "Parar de ouvir" : "Ditar o nome"}
                    className={cn(
                      "grid size-14 shrink-0 place-items-center rounded-xl border-2 transition",
                      aOuvir ? "border-red-400 bg-red-500/20 text-red-300" : "border-gold/40 text-gold hover:border-gold",
                    )}
                  >
                    <Mic className="size-6" />
                  </button>
                )}
              </div>

              {!nova && achadas && (
                <ul className="divide-y divide-gold/10 overflow-hidden rounded-xl border border-gold/15">
                  {achadas.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => escolher(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gold/10">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/30 font-serif text-gold italic">
                          {c.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.phone ? `…${c.phone.replace(/\D/g, "").slice(-3)}` : "sem telefone"}
                            {c.lastVisit ? ` · última vez ${diaCurto(c.lastVisit)}` : " · ainda sem visitas"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => setNova(true)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gold hover:bg-gold/10"
                    >
                      <UserPlus className="size-4" /> {achadas.length ? "Não é nenhuma destas — " : "Ninguém com esse nome — "}nova cliente “{termo.trim()}”
                    </button>
                  </li>
                </ul>
              )}

              {nova && (
                <div className="grid gap-2 rounded-xl border border-gold/30 p-3 sm:grid-cols-[1fr_auto]">
                  <input
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    type="tel"
                    inputMode="tel"
                    placeholder={`Telemóvel de ${termo.trim().split(" ")[0] || "a cliente"}`}
                    aria-label="Telemóvel da nova cliente"
                    className={inputCls}
                    autoFocus
                  />
                  <button type="button" onClick={() => setNova(false)} className="px-2 text-xs text-muted-foreground hover:text-gold">
                    voltar à lista
                  </button>
                  <p className="text-xs text-muted-foreground sm:col-span-2">A ficha só é criada quando confirmar a marcação.</p>
                </div>
              )}
            </>
          )}
        </Passo>

        {/* 2. serviço */}
        <Passo n={2} titulo="Serviço">
          <div className="flex flex-wrap gap-2">
            {servicosAtivos.map((s) => (
              <Pilula
                key={s.id}
                on={servicos.includes(s.id)}
                onClick={() => setServicos((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))}
              >
                {s.name}
              </Pilula>
            ))}
            {!catalogo && <Loader2 className="size-4 animate-spin text-gold" />}
          </div>
        </Passo>

        {/* 3. profissional */}
        <Passo n={3} titulo="Profissional">
          <div className="flex flex-wrap gap-2">
            <Pilula on={profissional === null} onClick={() => setProfissional(null)}>
              Qualquer
            </Pilula>
            {(catalogo?.staff ?? []).map((p) => (
              <Pilula key={p.id} on={profissional === p.id} onClick={() => setProfissional(p.id)}>
                {p.name}
              </Pilula>
            ))}
          </div>
        </Passo>

        {/* 4. dia */}
        <Passo n={4} titulo="Dia">
          <div className="flex flex-wrap items-center gap-2">
            <Pilula on={data === hojeIso()} onClick={() => setData(hojeIso())}>
              Hoje
            </Pilula>
            <Pilula on={data === somarDias(hojeIso(), 1)} onClick={() => setData(somarDias(hojeIso(), 1))}>
              Amanhã
            </Pilula>
            <input
              type="date"
              value={data}
              min={hojeIso()}
              onChange={(e) => e.target.value && setData(e.target.value)}
              aria-label="Outro dia"
              className={cn(inputCls, "w-auto py-2")}
            />
          </div>
        </Passo>

        {/* 5. hora */}
        <Passo n={5} titulo="Hora livre">
          {!servicos.length ? (
            <p className="text-sm text-muted-foreground">Escolha primeiro o serviço.</p>
          ) : horas === null ? (
            <Loader2 className="size-4 animate-spin text-gold" />
          ) : horas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem horas livres nesse dia. Experimente outro dia ou outra profissional.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {horas.map((h) => (
                <Pilula key={h.start} on={hora === h.time} onClick={() => setHora(h.time)}>
                  <span className="tabular-nums">{h.time}</span>
                </Pilula>
              ))}
            </div>
          )}
        </Passo>

        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" aria-label="Notas" className={inputCls} />

        <Btn onClick={rever} disabled={!pronto || ocupado} className="w-full sm:w-auto">
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Rever marcação
        </Btn>
      </Card>

      {proposta && (
        <CartaoConfirmar
          proposta={proposta}
          catalogo={catalogo}
          onCancelar={() => setProposta(null)}
          onPreparar={async (entrada) => {
            setOcupado(true);
            try {
              const r = await mgrPrepareDraft(entrada);
              if ("erro" in r) flash.show({ ok: false, error: r.erro });
              else if (r.proposta) setProposta(r.proposta);
              else flash.show({ ok: false, error: r.reply || "Hora indisponível." });
            } finally {
              setOcupado(false);
            }
          }}
          onConfirmar={async (p) => {
            setOcupado(true);
            try {
              const r = await mgrConfirmDraft(p);
              flash.show(r, r.ok ? (r.data?.mensagem ?? "Marcado ✓") : undefined);
              if (r.ok) recomecar();
            } finally {
              setOcupado(false);
            }
          }}
        />
      )}

      {flash.node}
    </div>
  );
}

type EntradaPreparar = {
  clienteId?: string | null;
  nome?: string;
  telefone?: string | null;
  servicosIds: string[];
  data: string;
  hora: string;
  profissionalId?: string | null;
  notas?: string | null;
};

function CartaoConfirmar({
  proposta,
  catalogo,
  onConfirmar,
  onPreparar,
  onCancelar,
}: {
  proposta: Proposta;
  catalogo: { services: MgrService[]; staff: MgrStaff[] } | null;
  onConfirmar: (p: Proposta) => void;
  onPreparar: (e: EntradaPreparar) => void;
  onCancelar: () => void;
}) {
  const [editar, setEditar] = useState(false);

  if (proposta.kind !== "criar") {
    return (
      <Card className="border-gold/60">
        <p className="font-label text-[11px] tracking-[0.2em] text-gold uppercase">
          {proposta.kind === "editar" ? "Mudar marcação" : "Cancelar marcação"}
        </p>
        <p className="mt-2 text-sm">{proposta.resumo}</p>
        <div className="mt-4 flex gap-2">
          <Btn onClick={() => onConfirmar(proposta)}>
            <Check className="size-4" /> Confirmar
          </Btn>
          <Btn variant="ghost" onClick={onCancelar}>
            <X className="size-4" /> Deixar estar
          </Btn>
        </div>
      </Card>
    );
  }

  const p = proposta;
  return (
    <Card className="border-gold/60">
      <p className="font-label text-[11px] tracking-[0.2em] text-gold uppercase">Confirmar marcação</p>

      {!editar ? (
        <dl className="mt-3 grid gap-1.5 text-sm">
          <Linha termo="Cliente" valor={`${p.clientName}${p.phone ? ` · ${p.phone}` : ""}${p.clientId ? "" : " (ficha nova)"}`} />
          <Linha termo="Serviço" valor={p.serviceNames.join(" + ")} />
          <Linha termo="Profissional" valor={p.staffName ?? "—"} />
          <Linha termo="Quando" valor={`${p.date.split("-").reverse().join("/")} às ${p.time}`} />
          <Linha
            termo="Preço"
            valor={
              p.discountPct > 0 ? (
                <>
                  <span className="text-muted-foreground line-through">{p.price.toFixed(2)} €</span>{" "}
                  <b className="text-gold">{p.total.toFixed(2)} €</b> <span className="text-xs text-emerald-300">−{p.discountPct}%</span>
                </>
              ) : (
                <b className="text-gold">{p.total.toFixed(2)} €</b>
              )
            }
          />
          {p.notes && <Linha termo="Notas" valor={p.notes} />}
        </dl>
      ) : (
        <Formulario proposta={p} catalogo={catalogo} onPreparar={onPreparar} />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn onClick={() => onConfirmar(p)} disabled={!p.clientName || (!p.clientId && !p.phone)}>
          <Check className="size-4" /> Confirmar
        </Btn>
        <Btn variant="ghost" onClick={() => setEditar((v) => !v)}>
          {editar ? "Fechar" : "Editar"}
        </Btn>
        <Btn variant="ghost" onClick={onCancelar}>
          <X className="size-4" /> Deixar estar
        </Btn>
      </div>
      {!p.clientId && !p.phone && <p className="mt-2 text-xs text-amber-300">Falta o telefone para criar a ficha. Toque em Editar.</p>}
    </Card>
  );
}

const Linha = ({ termo, valor }: { termo: string; valor: React.ReactNode }) => (
  <div className="flex gap-3">
    <dt className="w-24 shrink-0 text-muted-foreground">{termo}</dt>
    <dd className="min-w-0 flex-1">{valor}</dd>
  </div>
);

function Formulario({
  proposta,
  catalogo,
  onPreparar,
}: {
  proposta: Extract<Proposta, { kind: "criar" }>;
  catalogo: { services: MgrService[]; staff: MgrStaff[] } | null;
  onPreparar: (e: EntradaPreparar) => void;
}) {
  const [f, setF] = useState({
    nome: proposta.clientName,
    telefone: proposta.phone ?? "",
    servicosIds: proposta.serviceIds,
    profissionalId: proposta.staffId ?? "",
    data: proposta.date,
    hora: proposta.time,
    notas: proposta.notes ?? "",
  });

  return (
    <div className="mt-3 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input className={inputCls} placeholder="Telefone" type="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs text-muted-foreground">Serviços</span>
        <div className="flex flex-wrap gap-2">
          {(catalogo?.services ?? []).map((s) => {
            const on = f.servicosIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setF({ ...f, servicosIds: on ? f.servicosIds.filter((x) => x !== s.id) : [...f.servicosIds, s.id] })
                }
                className={cn(
                  "min-h-10 rounded-full border px-3.5 text-xs transition",
                  on ? "border-gold bg-gold/20 text-gold" : "border-gold/25 text-muted-foreground hover:border-gold/60",
                )}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <select className={inputCls} value={f.profissionalId} onChange={(e) => setF({ ...f, profissionalId: e.target.value })}>
          <option value="">Qualquer profissional</option>
          {(catalogo?.staff ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input className={inputCls} type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
        <input className={inputCls} type="time" step={300} value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
      </div>
      <input className={inputCls} placeholder="Notas (opcional)" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      <Btn
        variant="ghost"
        disabled={!f.servicosIds.length || !f.data || !f.hora}
        onClick={() =>
          onPreparar({
            clienteId: proposta.clientId,
            nome: f.nome,
            telefone: f.telefone || null,
            servicosIds: f.servicosIds,
            data: f.data,
            hora: f.hora,
            profissionalId: f.profissionalId || null,
            notas: f.notas || null,
          })
        }
      >
        Recalcular
      </Btn>
      <p className="text-xs text-muted-foreground">
        O preço e a disponibilidade são confirmados pelo servidor — por isso é preciso recalcular depois de mexer.
      </p>
    </div>
  );
}
