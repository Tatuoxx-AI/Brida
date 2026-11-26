"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mgrEspecialidades, mgrSetEspecialidade, type Especialidade } from "@/actions/especialidades";
import { useFlash } from "./ui";

const OPCOES: Array<{ id: Especialidade; label: string; detalhe: string }> = [
  { id: "cabeleireira", label: "💇‍♀️ Cabeleireira", detalhe: "cortes, coloração, madeixas, alisamento, brushing, tratamentos" },
  { id: "manicure", label: "💅 Manicure", detalhe: "manicure, pedicure, unhas de gel" },
  { id: "esteticista", label: "✨ Sobrancelhas", detalhe: "design de sobrancelhas" },
  { id: "depilacao", label: "🌸 Depilação", detalhe: "serviços da categoria Estética (depilação)" },
];

/**
 * Botões de experiência de uma funcionária. Cada botão liga/desliga todos os
 * serviços da área — a agenda do site e o agente de WhatsApp só marcam cada
 * serviço com quem tem a experiência certa.
 */
export function Especialidades({ staffId, nome, onSaved }: { staffId: string; nome: string; onSaved?: () => void }) {
  const [on, setOn] = useState<Especialidade[] | null>(null);
  const [busy, setBusy] = useState<Especialidade | null>(null);
  const flash = useFlash();

  useEffect(() => {
    mgrEspecialidades().then((m) => setOn(m[staffId] ?? []));
  }, [staffId]);

  const toggle = async (esp: Especialidade) => {
    if (!on || busy) return;
    const ligar = !on.includes(esp);
    setBusy(esp);
    const r = await mgrSetEspecialidade({ staffId, especialidade: esp, ligar });
    setBusy(null);
    flash.show(r, r.ok ? r.message : undefined);
    if (r.ok) {
      setOn(ligar ? [...on, esp] : on.filter((x) => x !== esp));
      onSaved?.();
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Experiência de {nome}</p>
      <div className="flex flex-wrap gap-2">
        {OPCOES.map((o) => {
          const ativo = on?.includes(o.id) ?? false;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!on || busy !== null}
              aria-pressed={ativo}
              title={o.detalhe}
              onClick={() => toggle(o.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50",
                ativo ? "border-gold bg-gold/15 text-gold" : "border-white/15 text-muted-foreground hover:border-gold/50",
              )}
            >
              {o.label}
              {busy === o.id ? " …" : ativo ? " ✓" : " +"}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Só faz os serviços das áreas ligadas — a agenda e o WhatsApp marcam cada serviço só com quem tem a experiência certa.
      </p>
      {flash.node}
    </div>
  );
}
