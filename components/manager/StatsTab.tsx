"use client";

import { useEffect, useState } from "react";
import { mgrStats, type MgrStats } from "@/actions/manager";
import { formatMoney } from "@/lib/format";
import { Card } from "./ui";

const SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const label = (ym: string) => `${SHORT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

export function StatsTab() {
  const [s, setS] = useState<MgrStats | null>(null);
  useEffect(() => {
    mgrStats().then(setS);
  }, []);
  if (!s) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [String(s.clients), "Clientes · 12 meses"],
          [String(s.appointments), "Marcações · 12 meses"],
          [formatMoney(s.revenue).replace(",00", ""), "Receita · 12 meses"],
        ].map(([v, l]) => (
          <Card key={l} className="text-center">
            <p className="font-serif text-4xl text-gold">{v}</p>
            <p className="mt-1 font-label text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{l}</p>
          </Card>
        ))}
      </div>
      {s.pending > 0 && <p className="text-center text-sm text-amber-300">{s.pending} marcação(ões) futura(s) por confirmar — ver separador Agenda.</p>}
      <Bars title="Receita por mês" data={s.months.map((m) => ({ k: m.month, v: m.revenue }))} format={(v) => formatMoney(v).replace(",00", "")} />
      <Bars title="Clientes por mês" data={s.months.map((m) => ({ k: m.month, v: m.clients }))} format={String} />
      <Bars title="Marcações por mês" data={s.months.map((m) => ({ k: m.month, v: m.appointments }))} format={String} />
    </div>
  );
}

function Bars({ title, data, format }: { title: string; data: { k: string; v: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <Card>
      <p className="font-medium">{title}</p>
      <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2">
        {data.map((d) => (
          <div key={d.k} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-gold opacity-0 transition group-hover:opacity-100">{d.v ? format(d.v) : ""}</span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-gold/40 to-gold transition-all"
              style={{ height: `${Math.max(2, (d.v / max) * 100)}%`, opacity: d.v ? 1 : 0.25 }}
              title={`${label(d.k)}: ${format(d.v)}`}
            />
            <span className="text-[9px] text-muted-foreground sm:text-[10px]">{label(d.k)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
