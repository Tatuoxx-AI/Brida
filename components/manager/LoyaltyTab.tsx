"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { mgrLoyalty, mgrRedeem, mgrSaveLoyalty, type MgrRedemption } from "@/actions/manager";
import { Btn, Card, Empty, Field, H2, useFlash } from "./ui";
import { LoyaltyCard } from "@/components/shared/LoyaltyCard";

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
