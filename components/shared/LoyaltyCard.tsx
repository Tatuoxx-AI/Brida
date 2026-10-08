"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BStamp } from "./BStamp";

/** Cartão de carimbos (frente/verso). Reutilizável na área de cliente. */
export type LoyaltyLabels = { client: string; stamps: string; equals: string; flip: string; rules: string[] };

const PT: LoyaltyLabels = {
  client: "Cliente",
  stamps: "Carimbos",
  equals: "carimbos =",
  flip: "Toque no cartão para ver o verso",
  rules: ["1 carimbo por cada visita concluída", "Peça a troca na área de cliente ou ao balcão"],
};

export function LoyaltyCard({
  name,
  stamps,
  required,
  reward,
  code,
  brand = "Brida Coiffeur",
  labels = PT,
}: {
  name: string;
  stamps: number;
  required: number;
  reward: string;
  code?: string;
  brand?: string;
  labels?: LoyaltyLabels;
}) {
  const [back, setBack] = useState(false);
  const cols = required <= 10 ? 5 : 6;
  return (
    <div className="mx-auto w-full max-w-sm">
      <button
        type="button"
        onClick={() => setBack((b) => !b)}
        aria-label={labels.flip}
        className="relative block aspect-[1.6] w-full [perspective:1200px]"
      >
        <div className={cn("relative size-full transition-transform duration-700 [transform-style:preserve-3d]", back && "[transform:rotateY(180deg)]")}>
          {/* frente */}
          <div className="absolute inset-0 flex flex-col rounded-2xl border border-gold/50 bg-[radial-gradient(120%_120%_at_0%_0%,#3a2f1c,#141210_60%)] p-5 text-left shadow-2xl [backface-visibility:hidden]">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-label text-[9px] tracking-[0.3em] text-gold uppercase">{labels.client}</p>
                <p className="font-serif text-2xl">{name}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-full border border-gold/60 font-serif text-xl text-gold italic">B</span>
            </div>
            <div className="my-auto grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: required }, (_, i) =>
                i < stamps ? (
                  <BStamp key={i} size={32} rotate={i % 2 ? 8 : -8} className="mx-auto" />
                ) : (
                  <span
                    key={i}
                    className="mx-auto grid size-8 place-items-center rounded-full border border-gold/20 text-[10px] font-semibold text-gold/25"
                  >
                    B
                  </span>
                ),
              )}
            </div>
            <div className="flex items-end justify-between">
              <p>
                <span className="font-label text-[9px] tracking-[0.3em] text-gold uppercase">{labels.stamps}</span>
                <br />
                <span className="font-serif text-3xl text-gold">{stamps}</span>
                <span className="text-sm text-muted-foreground">/{required}</span>
              </p>
              <p className="max-w-[55%] text-right font-label text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                {required} {labels.equals} {reward}
              </p>
            </div>
          </div>
          {/* verso */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-gold/50 bg-[#141210] p-5 text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="font-serif text-xl">{brand}</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>✦ {labels.rules[0]}</li>
              <li>
                ✦ {required} {labels.equals} {reward}
              </li>
              <li>✦ {labels.rules[1]}</li>
            </ul>
            <p className="font-mono text-sm tracking-[0.3em] text-gold">{code ?? "B R I D A"}</p>
          </div>
        </div>
      </button>
      <p className="mt-3 text-center font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">{labels.flip}</p>
    </div>
  );
}
