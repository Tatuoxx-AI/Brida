"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mgrLoyalty, mgrRedeem, mgrSaveLoyalty, type MgrRedemption } from "@/actions/manager";
import { Btn, Card, Empty, Field, H2, useFlash } from "./ui";

export function LoyaltyTab() {
  const [data, setData] = useState<Awaited<ReturnType<typeof mgrLoyalty>> | null>(null);
  const [stamps, setStamps] = useState(10);
  const [reward, setReward] = useState("");
  const flash = useFlash();
  const load = useCallback(() => {
    mgrLoyalty().then((d) => {
      setData(d);
      setStamps(d.stampsRequired);
      setReward(d.reward);
    });
  }, []);
  useEffect(load, [load]);
  if (!data) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-4">
        <H2>Configuração do cartão</H2>
        <Field label="Carimbos necessários" type="number" min={2} max={50} value={stamps} onChange={(e) => setStamps(Number(e.target.value))} />
        <Field label='Recompensa (ex.: "uma hidratação grátis" ou "20% de desconto")' value={reward} onChange={(e) => setReward(e.target.value)} />
        <p className="text-xs text-muted-foreground">Cada visita concluída na agenda dá 1 carimbo automaticamente. Também pode dar carimbos à mão em Clientes.</p>
        <div className="flex items-center gap-3">
          <Btn onClick={async () => (flash.show(await mgrSaveLoyalty(stamps, reward)), load())}>Guardar cartão</Btn>
          {flash.node}
        </div>
      </section>

      <section className="space-y-3">
        <H2>Resgates pendentes</H2>
        {data.redemptions.length === 0 ? (
          <Empty>Sem pedidos de resgate pendentes.</Empty>
        ) : (
          data.redemptions.map((r) => <RedemptionRow key={r.id} r={r} onDone={load} />)
        )}
        {data.ready.length > 0 && (
          <Card className="mt-4">
            <p className="font-medium">Clientes com o cartão completo</p>
            <p className="text-sm text-muted-foreground">Troque ao balcão: desconta {data.stampsRequired} carimbos.</p>
            <ul className="mt-3 divide-y divide-gold/10">
              {data.ready.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{c.name}</span>
                  <span className="text-sm text-gold">{c.stamps} ✦</span>
                  <Btn className="h-9 px-4" onClick={async () => (flash.show(await mgrRedeem({ clientId: c.id, approve: true }), "Troca registada ✓"), load())}>
                    Trocar
                  </Btn>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <H2>Pré-visualização</H2>
        <LoyaltyCard name="Cliente Exemplo" stamps={Math.min(4, stamps)} required={stamps} reward={reward} />
      </section>
    </div>
  );
}

function RedemptionRow({ r, onDone }: { r: MgrRedemption; onDone: () => void }) {
  const flash = useFlash();
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-4">
      <div className="flex-1">
        <p className="font-medium">{r.client}</p>
        <p className="text-sm text-muted-foreground">
          {r.reward} · {r.stamps} carimbos
        </p>
      </div>
      {flash.node}
      <Btn className="h-9 px-4" onClick={async () => (flash.show(await mgrRedeem({ redemptionId: r.id, approve: true }), "Aprovado ✓"), onDone())}>
        Aprovar
      </Btn>
      <Btn variant="danger" className="h-9 px-4" onClick={async () => (await mgrRedeem({ redemptionId: r.id, approve: false }), onDone())}>
        Recusar
      </Btn>
    </Card>
  );
}

/** Cartão de carimbos (frente/verso). Reutilizável na área de cliente. */
export function LoyaltyCard({ name, stamps, required, reward, code }: { name: string; stamps: number; required: number; reward: string; code?: string }) {
  const [back, setBack] = useState(false);
  const cols = required <= 10 ? 5 : 6;
  return (
    <div className="mx-auto w-full max-w-sm">
      <button
        type="button"
        onClick={() => setBack((b) => !b)}
        aria-label="Virar cartão"
        className="relative block aspect-[1.6] w-full [perspective:1200px]"
      >
        <div className={cn("relative size-full transition-transform duration-700 [transform-style:preserve-3d]", back && "[transform:rotateY(180deg)]")}>
          {/* frente */}
          <div className="absolute inset-0 flex flex-col rounded-2xl border border-gold/50 bg-[radial-gradient(120%_120%_at_0%_0%,#3a2f1c,#141210_60%)] p-5 text-left shadow-2xl [backface-visibility:hidden]">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-label text-[9px] tracking-[0.3em] text-gold uppercase">Cliente</p>
                <p className="font-serif text-2xl">{name}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-full border border-gold/60 font-serif text-xl text-gold italic">B</span>
            </div>
            <div className="my-auto grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: required }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "mx-auto grid size-8 place-items-center rounded-full border text-[10px] font-semibold",
                    i < stamps ? "border-gold bg-gold/25 text-gold shadow-[0_0_10px] shadow-gold/30" : "border-gold/20 text-gold/25",
                  )}
                >
                  B
                </span>
              ))}
            </div>
            <div className="flex items-end justify-between">
              <p>
                <span className="font-label text-[9px] tracking-[0.3em] text-gold uppercase">Carimbos</span>
                <br />
                <span className="font-serif text-3xl text-gold">{stamps}</span>
                <span className="text-sm text-muted-foreground">/{required}</span>
              </p>
              <p className="max-w-[55%] text-right font-label text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                {required} carimbos = {reward}
              </p>
            </div>
          </div>
          {/* verso */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-gold/50 bg-[#141210] p-5 text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="font-serif text-xl">Brida Coiffeur</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>✦ 1 carimbo por cada visita concluída</li>
              <li>✦ Com {required} carimbos: {reward}</li>
              <li>✦ Peça a troca na área de cliente ou ao balcão</li>
            </ul>
            <p className="font-mono text-sm tracking-[0.3em] text-gold">{code ?? "B R I D A"}</p>
          </div>
        </div>
      </button>
      <p className="mt-3 text-center font-label text-[10px] tracking-[0.25em] text-muted-foreground uppercase">Toque no cartão para ver o verso</p>
    </div>
  );
}
