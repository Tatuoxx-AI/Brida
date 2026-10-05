"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mgrSaveBusiness,
  mgrSaveHours,
  mgrSaveService,
  mgrSaveStaff,
  mgrSaveStaffProfile,
  mgrSiteData,
  type MgrBusiness,
  type MgrService,
  type MgrStaff,
} from "@/actions/manager";
import { SERVICE_CATEGORY_LABEL, type BusinessHoursRow, type ServiceCategory } from "@/types/database";
import { Btn, Card, Field, H2, TextArea, Toggle, inputCls, useFlash } from "./ui";
import { PhotosSection, addToForm } from "./PhotosSection";
import { ContentEditor } from "./ContentEditor";

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
      <PhotosSection />
      <ContentEditor />
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
      <p className="text-sm text-muted-foreground">
        Quem aparece na secção «A nossa equipa» e para escolher na agenda. O cargo é traduzido sozinho para as outras línguas; as redes só aparecem se
        tiverem link. Novas profissionais fazem todos os serviços.
      </p>
      <div className="space-y-3">
        {initial.map((p) => (
          <MemberCard key={p.id} member={p} onSaved={onSaved} />
        ))}
      </div>
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

function MemberCard({ member: p, onSaved }: { member: MgrStaff; onSaved: () => void }) {
  const [f, setF] = useState({
    name: p.name,
    job_title: p.job_title ?? "",
    instagram: p.socials?.instagram ?? "",
    facebook: p.socials?.facebook ?? "",
    tiktok: p.socials?.tiktok ?? "",
    team_order: String(p.team_order ?? 0),
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState<string | null>(p.avatar_url);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    const form = new FormData();
    form.append("id", p.id);
    for (const [k, v] of Object.entries(f)) form.append(k, v.trim());
    if (photo) await addToForm(form, "photo", photo);
    else if (removePhoto) form.append("removePhoto", "1");
    const r = await mgrSaveStaffProfile(form);
    setBusy(false);
    flash.show(r);
    if (r.ok) {
      setPhoto(null);
      setRemovePhoto(false);
      onSaved();
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="group relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-gold/25 bg-black/40">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local ou /media
            <img src={preview} alt={p.name} className="size-full object-cover" />
          ) : (
            <span className="font-serif text-3xl text-gold italic">{f.name.charAt(0) || "?"}</span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100">
            <ImagePlus className="size-5 text-gold" />
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={`Foto de ${p.name}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPhoto(file);
              setRemovePhoto(false);
              setPreview(URL.createObjectURL(file));
            }}
          />
        </label>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-xl">{p.name}</p>
          <p className="text-xs text-muted-foreground">{p.services} serviços · toque na foto para trocar</p>
          {preview && (
            <button
              type="button"
              className="mt-1 text-xs text-red-300 hover:underline"
              onClick={() => {
                setPhoto(null);
                setRemovePhoto(true);
                setPreview(null);
              }}
            >
              Remover foto
            </button>
          )}
        </div>
        <Toggle on={p.active} label={`${p.name} ativa`} onChange={async (x) => (flash.show(await mgrSaveStaff({ id: p.id, name: p.name, active: x })), onSaved())} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
        <Field label="Nome" value={f.name} onChange={set("name")} required />
        <Field label="Cargo" value={f.job_title} onChange={set("job_title")} placeholder="Ex.: Colorista" />
        <Field label="Ordem" type="number" min={0} max={99} value={f.team_order} onChange={set("team_order")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Instagram" type="url" value={f.instagram} onChange={set("instagram")} placeholder="https://instagram.com/…" />
        <Field label="Facebook" type="url" value={f.facebook} onChange={set("facebook")} placeholder="https://facebook.com/…" />
        <Field label="TikTok" type="url" value={f.tiktok} onChange={set("tiktok")} placeholder="https://tiktok.com/@…" />
      </div>
      <div className="flex items-center gap-3">
        <Btn onClick={save} disabled={busy}>
          {busy ? "A guardar…" : "Guardar"}
        </Btn>
        {flash.node}
      </div>
    </Card>
  );
}
