"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mgrSaveBusiness,
  mgrSaveHours,
  mgrSaveService,
  mgrSaveStaff,
  mgrSiteData,
  type MgrBusiness,
  type MgrService,
  type MgrStaff,
} from "@/actions/manager";
import { SERVICE_CATEGORY_LABEL, type BusinessHoursRow, type ServiceCategory } from "@/types/database";
import { Btn, Card, Field, H2, TextArea, Toggle, inputCls, useFlash } from "./ui";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SiteTab() {
  const [data, setData] = useState<Awaited<ReturnType<typeof mgrSiteData>> | null>(null);
  const load = useCallback(() => {
    mgrSiteData().then(setData);
  }, []);
  useEffect(load, [load]);
  if (!data) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <Business initial={data.business} />
      <Hours initial={data.hours} />
      <Services initial={data.services} onSaved={load} />
      <Team initial={data.staff} onSaved={load} />
      <p className="text-center text-xs text-muted-foreground">As alterações aparecem no site e na assistente logo depois de guardar.</p>
    </div>
  );
}

function Business({ initial }: { initial: MgrBusiness }) {
  const [b, setB] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ""])) as Record<keyof MgrBusiness, string>);
  const flash = useFlash();
  const field = (k: keyof MgrBusiness, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} {...props} />
  );
  return (
    <section className="space-y-4">
      <H2>Dados do negócio</H2>
      {field("name", "Nome do negócio", { required: true })}
      {field("area", "Área de atendimento")}
      {field("tagline", "Frase curta (rodapé)")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("phone", "Telefone (mostrado)", { type: "tel" })}
        {field("whatsapp", "WhatsApp (indicativo + número)", { type: "tel" })}
      </div>
      {field("email", "E-mail de contacto", { type: "email" })}
      {field("address", "Morada")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("instagram_url", "Instagram (link)", { type: "url", placeholder: "https://instagram.com/…" })}
        {field("facebook_url", "Facebook (link)", { type: "url", placeholder: "https://facebook.com/…" })}
      </div>
      <TextArea label="Sobre nós" value={b.about} onChange={(e) => setB({ ...b, about: e.target.value })} />
      <div className="flex items-center gap-3">
        <Btn onClick={async () => flash.show(await mgrSaveBusiness(b))}>Guardar dados</Btn>
        {flash.node}
      </div>
    </section>
  );
}

function Hours({ initial }: { initial: BusinessHoursRow[] }) {
  const [rows, setRows] = useState(() =>
    initial.map((h) => ({ ...h, opens_at: h.opens_at?.slice(0, 5) ?? "09:00", closes_at: h.closes_at?.slice(0, 5) ?? "19:00" })),
  );
  const flash = useFlash();
  const set = (weekday: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  return (
    <section className="space-y-4">
      <H2>Horário semanal</H2>
      <div className="space-y-2">
        {ORDER.map((d) => {
          const h = rows.find((r) => r.weekday === d)!;
          return (
            <div key={d} className="flex flex-wrap items-center gap-3">
              <label className="flex w-36 items-center gap-3">
                <input type="checkbox" checked={!h.is_closed} onChange={(e) => set(d, { is_closed: !e.target.checked })} className="size-5 accent-[var(--color-gold)]" />
                {DAYS[d]}
              </label>
              {h.is_closed ? (
                <span className="text-sm text-muted-foreground">Fechado</span>
              ) : (
                <>
                  <input type="time" value={h.opens_at} onChange={(e) => set(d, { opens_at: e.target.value })} className={cn(inputCls, "w-32 font-mono")} aria-label={`${DAYS[d]} abre`} />
                  <span>–</span>
                  <input type="time" value={h.closes_at} onChange={(e) => set(d, { closes_at: e.target.value })} className={cn(inputCls, "w-32 font-mono")} aria-label={`${DAYS[d]} fecha`} />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Btn onClick={async () => flash.show(await mgrSaveHours(rows))}>Guardar horário</Btn>
        {flash.node}
      </div>
    </section>
  );
}

const CATS = Object.keys(SERVICE_CATEGORY_LABEL) as ServiceCategory[];
const NEW: MgrService = { id: "", name: "", description: "", category: "corte", duration_minutes: 60, price: 0, is_addon: false, active: true, sort_order: 0 };

function Services({ initial, onSaved }: { initial: MgrService[]; onSaved: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <H2>Serviços e preços</H2>
          <p className="text-sm text-muted-foreground">Preço 0 aparece como “sob consulta”. Extras = adicionais como lavagem ou hidratação.</p>
        </div>
        {!adding && (
          <Btn variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Novo
          </Btn>
        )}
      </div>
      {adding && <ServiceRow s={NEW} onSaved={() => (setAdding(false), onSaved())} onCancel={() => setAdding(false)} />}
      {initial.map((s) => (
        <ServiceRow key={s.id} s={s} onSaved={onSaved} />
      ))}
    </section>
  );
}

function ServiceRow({ s, onSaved, onCancel }: { s: MgrService; onSaved: () => void; onCancel?: () => void }) {
  const [v, setV] = useState(s);
  const flash = useFlash();
  const dirty = JSON.stringify(v) !== JSON.stringify(s);
  return (
    <Card className={cn("space-y-3 p-4 sm:p-4", !v.active && "opacity-60")}>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Nome do serviço" aria-label="Nome" className={inputCls} />
        <select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as ServiceCategory })} aria-label="Categoria" className={inputCls}>
          {CATS.map((c) => (
            <option key={c} value={c}>
              {SERVICE_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <input
        value={v.description ?? ""}
        onChange={(e) => setV({ ...v, description: e.target.value })}
        placeholder="Descrição curta (opcional)"
        aria-label="Descrição"
        className={inputCls}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={5}
            max={600}
            step={5}
            value={v.duration_minutes}
            onChange={(e) => setV({ ...v, duration_minutes: Number(e.target.value) })}
            className={cn(inputCls, "w-24")}
            aria-label="Duração em minutos"
          />
          min
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={0}
            step={0.5}
            value={v.price}
            onChange={(e) => setV({ ...v, price: Number(e.target.value) })}
            className={cn(inputCls, "w-28")}
            aria-label="Preço em euros"
          />
          €
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Toggle on={v.is_addon} onChange={(x) => setV({ ...v, is_addon: x })} label="Extra" /> Extra
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Toggle on={v.active} onChange={(x) => setV({ ...v, active: x })} label="Ativo no site" /> Ativo
        </label>
        <div className="ml-auto flex items-center gap-2">
          {flash.node}
          {onCancel && (
            <Btn variant="ghost" className="h-9 px-4" onClick={onCancel}>
              Cancelar
            </Btn>
          )}
          {(dirty || !s.id) && (
            <Btn
              className="h-9 px-4"
              onClick={async () => {
                const r = await mgrSaveService({ ...v, id: v.id || undefined, description: v.description ?? null });
                flash.show(r);
                if (r.ok) onSaved();
              }}
            >
              Guardar
            </Btn>
          )}
        </div>
      </div>
    </Card>
  );
}

function Team({ initial, onSaved }: { initial: MgrStaff[]; onSaved: () => void }) {
  const [name, setName] = useState("");
  const flash = useFlash();
  return (
    <section className="space-y-4">
      <H2>Equipa</H2>
      <p className="text-sm text-muted-foreground">Quem aparece para escolher na agenda do site. Novas profissionais fazem todos os serviços.</p>
      <ul className="space-y-2">
        {initial.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border border-gold/15 bg-[#141210] px-4 py-3">
            <span className="flex-1">{p.name}</span>
            <span className="text-xs text-muted-foreground">{p.services} serviços</span>
            <Toggle on={p.active} label={`${p.name} ativa`} onChange={async (x) => (flash.show(await mgrSaveStaff({ id: p.id, name: p.name, active: x })), onSaved())} />
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await mgrSaveStaff({ name, active: true });
          flash.show(r, "Profissional adicionada ✓");
          if (r.ok) {
            setName("");
            onSaved();
          }
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da nova profissional" className={inputCls} aria-label="Nome da nova profissional" />
        <Btn type="submit" variant="ghost">
          Adicionar
        </Btn>
      </form>
      {flash.node}
    </section>
  );
}
