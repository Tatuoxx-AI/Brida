"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import { mgrAdjustStamps, mgrClients, mgrLoyalty, mgrRedeem, mgrSaveLoyalty, type MgrClient, type MgrRedemption } from "@/actions/manager";
import { BStamp } from "@/components/shared/BStamp";
import { Btn, Card, Empty, Field, H2, inputCls, useFlash } from "./ui";
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
      <StampsManager required={data.stampsRequired} reward={data.reward} onChange={load} />

      <section className="space-y-4">
        <H2>Configuração do cartão</H2>
        <Field label="Carimbos necessários" type="number" min={2} max={50} value={stamps} onChange={(e) => setStamps(Number(e.target.value))} />
        <Field label='Recompensa (ex.: "uma hidratação grátis" ou "20% de desconto")' value={reward} onChange={(e) => setReward(e.target.value)} />
        <p className="text-xs text-muted-foreground">Cada visita concluída na agenda dá 1 carimbo automaticamente. Também pode dar e tirar carimbos à mão aqui em baixo.</p>
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

/** Dar e tirar carimbos às clientes registadas, com o cartão delas à vista. */
function StampsManager({ required, reward, onChange }: { required: number; reward: string; onChange: () => void }) {
  const [search, setSearch] = useState("");
  const [list, setList] = useState<MgrClient[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flash = useFlash();
  const load = useCallback((q: string) => {
    mgrClients(q).then(setList);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const adjust = async (c: MgrClient, d: number) => {
    setBusy(true);
    const r = await mgrAdjustStamps(c.id, d);
    setBusy(false);
    flash.show(r, d > 0 ? `Carimbo dado a ${c.name.split(" ")[0]} ✓` : `Carimbo retirado a ${c.name.split(" ")[0]} ✓`);
    load(search);
    onChange();
  };

  return (
    <section className="space-y-3">
      <H2>Dar e tirar carimbos</H2>
      <p className="text-sm text-muted-foreground">Procure a cliente pelo nome ou telemóvel, toque nela e use + / −. Cada carimbo é o “B” da Brida no cartão dela.</p>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar cliente…" className={inputCls} aria-label="Procurar cliente" />
      {flash.node}
      {list === null ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : list.length === 0 ? (
        <Empty>Nenhuma cliente encontrada.</Empty>
      ) : (
        <ul className="divide-y divide-gold/10 overflow-hidden rounded-2xl border border-gold/15 bg-[#141210]">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gold/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.name}</span>
                  {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-gold">
                  {c.stamps > 0 && <BStamp size={18} />}
                  {c.stamps}/{required}
                </span>
              </button>
              {open === c.id && (
                <div className="space-y-4 border-t border-gold/10 px-4 pt-4 pb-5">
                  <LoyaltyCard name={c.name} stamps={Math.min(c.stamps, required)} required={required} reward={reward} />
                  <div className="flex items-center justify-center gap-3">
                    <Btn variant="ghost" disabled={busy || c.stamps === 0} onClick={() => adjust(c, -1)}>
                      <Minus className="size-4" /> Tirar
                    </Btn>
                    <span className="min-w-14 text-center font-serif text-3xl text-gold">{c.stamps}</span>
                    <Btn disabled={busy} onClick={() => adjust(c, 1)}>
                      <Plus className="size-4" /> Dar carimbo
                    </Btn>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
