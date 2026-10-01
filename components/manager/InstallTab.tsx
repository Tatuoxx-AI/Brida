"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Btn, Card, H2 } from "./ui";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallTab() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <H2>Painel no ecrã do telemóvel</H2>
      <p className="text-sm text-muted-foreground">
        Instale o painel como uma app: abre direto aqui, em ecrã inteiro, sem precisar de lembrar o endereço secreto. A sessão fica guardada 30 dias.
      </p>

      {installed ? (
        <Card>
          <p className="text-emerald-300">✓ O painel já está instalado neste dispositivo.</p>
        </Card>
      ) : evt ? (
        <Btn
          onClick={async () => {
            await evt.prompt();
            if ((await evt.userChoice).outcome === "accepted") setInstalled(true);
            setEvt(null);
          }}
        >
          <Download className="size-4" /> Instalar app
        </Btn>
      ) : null}

      <Card className="space-y-3">
        <p className="font-medium">iPhone (Safari)</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          1. Toque em <Share className="size-4 text-gold" /> Partilhar
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          2. Escolha <SquarePlus className="size-4 text-gold" /> “Adicionar ao ecrã principal”
        </p>
      </Card>
      <Card className="space-y-3">
        <p className="font-medium">Android (Chrome) e computador</p>
        <p className="text-sm text-muted-foreground">Use o botão “Instalar app” acima, ou o menu ⋮ → “Instalar app” / “Adicionar ao ecrã principal”.</p>
      </Card>
      <p className="text-xs text-muted-foreground">Não partilhe a app nem o endereço: quem o tiver ainda precisa da senha, mas é melhor ficar só consigo.</p>
    </div>
  );
}
