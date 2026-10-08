"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Smartphone, Trash2 } from "lucide-react";
import { mgrCreateWidgetKey, mgrRevokeWidgetKey, mgrWidgetKeys, mgrWidgetPreview, type MgrWidgetKey } from "@/actions/manager";
import { buildScriptableScript } from "@/lib/widget-script";
import type { WidgetAgenda } from "@/lib/widget";
import { Btn, Card, H2, Label, inputCls, useFlash } from "./ui";

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(iso)) : "nunca";

/** Réplica do widget grande, para a dona ver o aspeto antes de instalar. */
function Preview({ d }: { d: WidgetAgenda }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[22px] bg-gradient-to-b from-[#17130B] to-black p-4 shadow-2xl ring-1 ring-gold/20">
      <div className="flex items-center">
        <div>
          <p className="font-serif text-[22px] leading-none text-[#F6CF57] italic">Brida</p>
          <p className="mt-1 text-[11px] text-white/55">
            Hoje · {d.weekday} {d.date}
          </p>
        </div>
        <div className="ml-auto text-right leading-none">
          <p className="text-[30px] font-bold text-[#F6CF57]">{d.total}</p>
          <p className="text-[10px] text-white/55">{d.total === 1 ? "cliente" : "clientes"}</p>
        </div>
      </div>
      <div className="mt-3">
        {d.staff.slice(0, 8).map((p) => (
          <div key={p.name} className="flex items-center border-t border-[#F6CF57]/20 py-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-white">{p.name}</p>
              <p className="text-[11px] text-white/55">
                {p.count === 0
                  ? "Sem marcações"
                  : `1.ª ${p.first}${p.next && p.next !== p.first ? `  ·  próx. ${p.next}` : p.next ? "" : "  ·  sem mais hoje"}`}
              </p>
            </div>
            <div className="ml-auto text-right leading-none">
              <p className={`text-xl font-bold ${p.count ? "text-[#F6CF57]" : "text-white/55"}`}>{p.count}</p>
              <p className={`text-[9px] ${p.pending ? "text-[#B07A12]" : "text-white/55"}`}>
                {p.pending ? `${p.pending} por confirmar` : p.count === 1 ? "cliente" : "clientes"}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-right text-[9px] text-white/55">Atualizado agora</p>
    </div>
  );
}

export function WidgetSection() {
  const [preview, setPreview] = useState<WidgetAgenda | null>(null);
  const [keys, setKeys] = useState<MgrWidgetKey[]>([]);
  const [label, setLabel] = useState("");
  const [script, setScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const flash = useFlash();
  const load = useCallback(() => {
    mgrWidgetKeys().then(setKeys);
    mgrWidgetPreview().then(setPreview);
  }, []);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await mgrCreateWidgetKey(label);
    if (!r.ok) return flash.show(r);
    setScript(
      buildScriptableScript({
        apiUrl: `${location.origin}/api/widget/agenda`,
        token: r.token,
        openUrl: location.origin + location.pathname,
      }),
    );
    setCopied(false);
    setLabel("");
    load();
  };

  const copy = async () => {
    if (!script) return;
    await navigator.clipboard.writeText(script);
    setCopied(true);
  };

  return (
    <section className="space-y-4">
      <H2>Widget da agenda no ecrã inicial</H2>
      <p className="text-sm text-muted-foreground">
        Um widget grande no ecrã do telemóvel com o dia de hoje: cada profissional à esquerda, quantas clientes tem, a primeira e a próxima hora.
        Atualiza sozinho de 15 em 15 minutos. Não mostra nomes nem contactos das clientes.
      </p>

      {preview && <Preview d={preview} />}

      <Card className="space-y-4">
        <p className="flex items-center gap-2 font-medium">
          <Smartphone className="size-4 text-gold" /> iPhone — com a app gratuita Scriptable
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Instale a app <b className="text-foreground">Scriptable</b> da App Store (é grátis).</li>
          <li>Aqui em baixo, dê um nome a este telemóvel e toque em “Criar widget”; depois em “Copiar script”.</li>
          <li>
            Na Scriptable toque em <b className="text-foreground">+</b>, cole o script e dê-lhe o nome “Brida”.
          </li>
          <li>
            No ecrã inicial, mantenha o dedo num espaço vazio → <b className="text-foreground">+</b> → Scriptable → escolha o tamanho{" "}
            <b className="text-foreground">grande</b> → Adicionar.
          </li>
          <li>Mantenha o dedo no widget → Editar widget → Script: “Brida”.</li>
        </ol>

        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <Label>Nome deste telemóvel</Label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: iPhone da Claudia" className={inputCls} />
          </label>
          <Btn type="submit">Criar widget</Btn>
        </form>
        {flash.node}

        {script && (
          <div className="space-y-2 rounded-xl border border-gold/30 bg-black/40 p-4">
            <p className="text-sm">
              Script pronto. <b>Copie agora</b> — por segurança a chave só aparece esta vez (se perder, crie outro).
            </p>
            <Btn onClick={copy} variant={copied ? "ghost" : "gold"}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar script"}
            </Btn>
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <p className="font-medium">Android</p>
        <p className="text-sm text-muted-foreground">
          O Android não tem a app Scriptable. Para o widget no Android é preciso uma pequena app própria do salão — fale com quem gere o site.
        </p>
      </Card>

      {keys.length > 0 && (
        <div className="space-y-2">
          <Label>Telemóveis com widget</Label>
          <ul className="space-y-2">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 rounded-xl border border-gold/15 bg-[#141210] px-4 py-3 text-sm">
                <span className="flex-1">
                  {k.label}
                  <span className="block text-xs text-muted-foreground">Último acesso: {when(k.last_used_at)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Revogar ${k.label}`}
                  onClick={async () => {
                    if (!confirm(`Desligar o widget de "${k.label}"? Deixa de mostrar a agenda.`)) return;
                    flash.show(await mgrRevokeWidgetKey(k.id), "Widget desligado ✓");
                    load();
                  }}
                  className="p-1 text-red-300 hover:text-red-200"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
