"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { SiteServiceGroup } from "@/lib/site-data";
import { OpenChatButton } from "./OpenChatButton";

export function ServiceTabs({ groups }: { groups: SiteServiceGroup[] }) {
  const [active, setActive] = useState(groups[0]?.key);
  const group = groups.find((g) => g.key === active) ?? groups[0];

  return (
    <div>
      <div role="tablist" aria-label="Categorias de serviços" className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={g.key === group?.key}
            onClick={() => setActive(g.key)}
            className={cn(
              "rounded-full border px-5 py-2 font-label text-xs tracking-[0.2em] uppercase transition",
              g.key === group?.key
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted-foreground hover:border-accent/60 hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <ul role="tabpanel" className="mt-8 divide-y divide-border border-y border-border">
        {group?.items.map((s) => (
          <li key={s.name} className="group flex items-baseline gap-4 py-5">
            <div className="min-w-0 flex-1">
              <p className="font-serif text-2xl leading-tight transition group-hover:text-accent">{s.name}</p>
              {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
            </div>
            <div className="shrink-0 text-right">
              {s.price ? (
                <p className="font-serif text-xl text-accent">{formatMoney(s.price)}</p>
              ) : (
                <p className="font-label text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Sob consulta</p>
              )}
              {s.duration && <p className="text-xs text-muted-foreground">{s.duration} min</p>}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <OpenChatButton message={group ? `Quero marcar ${group.label.toLowerCase()}` : undefined}>Ver vagas e marcar</OpenChatButton>
        <p className="text-sm text-muted-foreground">O preço final depende do comprimento e do diagnóstico do cabelo.</p>
      </div>
    </div>
  );
}
