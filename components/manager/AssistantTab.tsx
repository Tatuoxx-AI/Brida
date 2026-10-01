"use client";

import { useEffect, useState } from "react";
import { mgrAssistant, mgrSaveAssistant, type MgrAssistant } from "@/actions/manager";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { Btn, Field, H2, TextArea, useFlash } from "./ui";

export function AssistantTab({ whatsappUrl }: { whatsappUrl: string }) {
  const [a, setA] = useState<MgrAssistant | null>(null);
  const [saved, setSaved] = useState<MgrAssistant | null>(null);
  const flash = useFlash();
  useEffect(() => {
    mgrAssistant().then((r) => (setA(r), setSaved(r)));
  }, []);
  if (!a || !saved) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,26rem)]">
      <section className="space-y-4">
        <H2>A sua assistente</H2>
        <p className="text-sm text-muted-foreground">
          Responde no site (e no WhatsApp, se ligar em Automação), vê a agenda em tempo real e faz marcações. Já conhece os serviços, preços,
          horário e equipa que estão em “Editar site”.
        </p>
        <Field label="Nome" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
        <TextArea label="Mensagem de boas-vindas" value={a.greeting} onChange={(e) => setA({ ...a, greeting: e.target.value })} className="[&_textarea]:min-h-20" />
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
      </section>
      <div>
        <p className="mb-3 font-label text-[11px] tracking-[0.2em] text-gold uppercase">Experimentar (conversa real)</p>
        <ChatPanel assistantName={saved.name} greeting={saved.greeting} salonWhatsappUrl={whatsappUrl} className="h-[560px]" />
      </div>
    </div>
  );
}
