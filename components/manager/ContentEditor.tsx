"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Languages, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { mgrContent, mgrSaveContent, mgrTranslateAll, type MgrContent } from "@/actions/manager";
import { CONTENT_FIELDS, type ContentKey, type Review, type SiteContent, type Stat } from "@/lib/i18n/content";
import { LOCALE_INFO } from "@/lib/i18n/locales";
import { Btn, Card, H2, Label, inputCls, useFlash } from "./ui";

/** Todos os textos, números e símbolos do site, agrupados como aparecem na página. */
export function ContentEditor() {
  const [data, setData] = useState<MgrContent | null>(null);
  const [values, setValues] = useState<SiteContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const flash = useFlash();

  const load = () =>
    mgrContent().then((d) => {
      setData(d);
      setValues(d.values);
    });
  useEffect(() => {
    load();
  }, []);

  if (!data || !values) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  const dirty = JSON.stringify(values) !== JSON.stringify(data.values);
  const set = <K extends ContentKey>(k: K, v: SiteContent[K]) => setValues({ ...values, [k]: v });

  return (
    <section className="space-y-4">
      <div>
        <H2>Textos do site</H2>
        <p className="text-sm text-muted-foreground">
          Tudo o que aparece escrito no site — títulos, palavras douradas, números, símbolos e depoimentos. Escreva em português: as outras 4 línguas são traduzidas
          automaticamente ao guardar.
        </p>
      </div>

      {CONTENT_FIELDS.map((g) => (
        <details key={g.group} className="group rounded-2xl border border-gold/20 bg-[#141210]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium">
            {g.group}
            <ChevronDown className="size-4 text-gold transition group-open:rotate-180" />
          </summary>
          <div className="space-y-4 border-t border-gold/10 px-5 pt-4 pb-5">
            {g.fields.map((f) => (
              <FieldEditor key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v as never)} />
            ))}
          </div>
        </details>
      ))}

      <Card className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 border-gold/40 p-4 shadow-2xl sm:p-4">
        <Btn
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            const r = await mgrSaveContent(values);
            setSaving(false);
            flash.show(
              r,
              r.ok && r.data?.translated === false ? "Guardado ✓ — traduções pendentes (sem créditos na IA)" : "Guardado e traduzido ✓",
            );
            load();
          }}
        >
          {saving && <Loader2 className="size-4 animate-spin" />} Guardar textos
        </Btn>
        {dirty && (
          <Btn variant="ghost" onClick={() => setValues(data.values)}>
            Desfazer
          </Btn>
        )}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Languages className="size-4 text-gold" />
          {data.missing.length === 0
            ? "Traduções em dia"
            : `Falta traduzir para: ${data.missing.map((l) => LOCALE_INFO[l].flag).join(" ")}`}
        </span>
        {data.missing.length > 0 && data.aiReady && (
          <Btn
            variant="ghost"
            className="h-9 px-4"
            disabled={translating}
            onClick={async () => {
              setTranslating(true);
              flash.show(await mgrTranslateAll(), "Traduções concluídas ✓");
              setTranslating(false);
              load();
            }}
          >
            {translating && <Loader2 className="size-4 animate-spin" />} Traduzir agora
          </Btn>
        )}
        {flash.node}
      </Card>
    </section>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: (typeof CONTENT_FIELDS)[number]["fields"][number];
  value: SiteContent[ContentKey];
  onChange: (v: unknown) => void;
}) {
  if (field.kind === "list") {
    const list = value as string[];
    return (
      <label className="block">
        <Label>{field.label}</Label>
        <textarea value={list.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} rows={Math.max(4, list.length + 1)} className={cn(inputCls, "leading-relaxed")} />
      </label>
    );
  }
  if (field.kind === "stats") {
    const stats = value as Stat[];
    return (
      <div>
        <Label>{field.label}</Label>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-[7rem_1fr] gap-2">
              <input
                value={stats[i]?.value ?? ""}
                placeholder="25"
                onChange={(e) => onChange(Object.assign([...stats], { [i]: { ...(stats[i] ?? { label: "" }), value: e.target.value } }))}
                className={inputCls}
                aria-label={`Destaque ${i + 1} — número`}
              />
              <input
                value={stats[i]?.label ?? ""}
                placeholder="anos de experiência"
                onChange={(e) => onChange(Object.assign([...stats], { [i]: { ...(stats[i] ?? { value: "" }), label: e.target.value } }))}
                className={inputCls}
                aria-label={`Destaque ${i + 1} — texto`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (field.kind === "reviews") {
    const reviews = value as Review[];
    const update = (i: number, patch: Partial<Review>) => onChange(reviews.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
      <div>
        <Label>{field.label}</Label>
        <div className="space-y-3">
          {reviews.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-gold/15 p-3">
              <div className="flex gap-2">
                <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Nome (ex.: Ana S.)" className={inputCls} aria-label="Nome" />
                <select value={r.rating} onChange={(e) => update(i, { rating: Number(e.target.value) })} className={cn(inputCls, "w-24")} aria-label="Estrelas">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label="Apagar depoimento" onClick={() => onChange(reviews.filter((_, j) => j !== i))} className="px-2 text-red-300">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <textarea value={r.text} onChange={(e) => update(i, { text: e.target.value })} rows={2} className={inputCls} aria-label="Texto do depoimento" />
            </div>
          ))}
          {reviews.length < 6 && (
            <Btn variant="ghost" className="h-9 px-4" onClick={() => onChange([...reviews, { name: "", rating: 5, text: "" }])}>
              <Plus className="size-4" /> Depoimento
            </Btn>
          )}
        </div>
      </div>
    );
  }
  return (
    <label className="block">
      <Label>{field.label}</Label>
      {field.long ? (
        <textarea value={value as string} onChange={(e) => onChange(e.target.value)} rows={4} className={cn(inputCls, "leading-relaxed")} />
      ) : (
        <input value={value as string} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </label>
  );
}
