"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { mgrAssistant, mgrSaveAssistant, type MgrAssistant } from "@/actions/manager";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { QuickBook } from "./QuickBook";
import { Btn, Field, H2, TextArea, useFlash } from "./ui";

export function AssistantTab({ whatsappUrl }: { whatsappUrl: string }) {
  const [a, setA] = useState<MgrAssistant | null>(null);
  const [saved, setSaved] = useState<MgrAssistant | null>(null);
  // A marcação rápida é o que ela abre dez vezes por dia; as definições da
  // assistente do site mexem-se uma vez por mês. Por isso estas ficam fechadas.
  const [defsAbertas, setDefsAbertas] = useState(false);
  const flash = useFlash();
  useEffect(() => {
    mgrAssistant().then((r) => (setA(r), setSaved(r)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="space-y-3">
        <H2>Marcar depressa</H2>
        <p className="text-sm text-muted-foreground">
          Escreva ou dite as primeiras letras do nome e escolha a cliente na lista; depois serviço, dia e hora livre. Sem IA — não gasta créditos.
        </p>
        <QuickBook />
      </section>

      <section>
        <button
          type="button"
          onClick={() => setDefsAbertas((v) => !v)}
          aria-expanded={defsAbertas}
          className="flex w-full items-center gap-3 rounded-2xl border border-gold/20 bg-[#141210] px-5 py-4 text-left"
        >
          <span className="flex-1">
            <span className="block font-serif text-xl">A assistente do site</span>
            <span className="block text-xs text-muted-foreground">Nome, boas-vindas e indicações de quem responde aos clientes</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", defsAbertas && "rotate-180")} />
        </button>

        {defsAbertas && a && saved && (
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_minmax(0,24rem)]">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Responde no site (e no WhatsApp, se ligar em Automação), vê a agenda em tempo real e faz marcações. Já conhece os serviços,
                preços, horário e equipa que estão em “Editar site”.
              </p>
              <Field label="Nome" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
              <TextArea
                label="Mensagem de boas-vindas"
                value={a.greeting}
                onChange={(e) => setA({ ...a, greeting: e.target.value })}
                className="[&_textarea]:min-h-20"
              />
              <TextArea
                label="Indicações e perguntas frequentes"
                value={a.instructions}
                onChange={(e) => setA({ ...a, instructions: e.target.value })}
                placeholder={"Ex.:\n- Madeixas em cabelo muito comprido levam mais 30 min.\n- Temos estacionamento gratuito em frente.\n- Não fazemos extensões de cabelo."}
                className="[&_textarea]:min-h-48"
              />
              <div className="flex items-center gap-3">
                <Btn
                  onClick={async () => {
                    const r = await mgrSaveAssistant(a);
                    flash.show(r);
                    if (r.ok) setSaved(a);
                  }}
                >
                  Guardar
                </Btn>
                {flash.node}
              </div>
            </div>
            <div>
              <p className="mb-3 font-label text-[11px] tracking-[0.2em] text-gold uppercase">Experimentar (conversa real)</p>
              <ChatPanel assistantName={saved.name} greeting={saved.greeting} salonWhatsappUrl={whatsappUrl} className="h-[560px]" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
