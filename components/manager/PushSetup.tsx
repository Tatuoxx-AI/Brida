"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { mgrKeepAlive, mgrPushDevices, mgrRemovePush, mgrSavePush, mgrTestPush } from "@/actions/manager";
import { Btn, Card } from "./ui";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const urlB64ToUint8 = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Regista o service worker, mantém a sessão viva e liga as notificações push. */
export function usePush(base: string, vapidKey: string) {
  const [state, setState] = useState<State>("loading");
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    mgrKeepAlive().catch(() => {});
    if (!("serviceWorker" in navigator)) return setState("unsupported");
    navigator.serviceWorker
      .register(`${base}/sw.js`, { scope: `${base}/` })
      .then(async (r) => {
        setReg(r);
        // no iPhone as notificações só existem com o painel instalado no ecrã inicial
        if (!("PushManager" in window) || !("Notification" in window)) return setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        if (Notification.permission === "denied") return setState("denied");
        const sub = await r.pushManager.getSubscription();
        if (sub) {
          await mgrSavePush(sub.toJSON(), navigator.userAgent); // reafirma no servidor
          setState("on");
        } else setState("off");
      })
      .catch(() => setState("unsupported"));
  }, [base]);

  const enable = useCallback(async () => {
    if (!reg || !vapidKey) return false;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState(perm === "denied" ? "denied" : "off");
      return false;
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(vapidKey) });
    const r = await mgrSavePush(sub.toJSON(), navigator.userAgent);
    setState(r.ok ? "on" : "off");
    return r.ok;
  }, [reg, vapidKey]);

  const disable = useCallback(async () => {
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await mgrRemovePush(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }, [reg]);

  return { state, enable, disable };
}

/** Faixa no topo do painel enquanto as notificações não estiverem ligadas neste aparelho. */
export function PushBanner({ push }: { push: ReturnType<typeof usePush> }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem("brida-push-banner") === "0");
    } catch {}
  }, []);
  if (hidden || !["off", "needs-install", "denied"].includes(push.state)) return null;
  return (
    <div className="border-b border-gold/30 bg-gold/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 text-sm sm:px-8">
        <BellRing className="size-5 shrink-0 text-gold" />
        <p className="flex-1">
          {push.state === "off" && "Receba um aviso no telemóvel sempre que um cliente marcar."}
          {push.state === "needs-install" && "Para receber avisos no iPhone: Partilhar → “Adicionar ao ecrã principal” e abra o painel por esse ícone."}
          {push.state === "denied" && "As notificações estão bloqueadas neste aparelho. Ative-as nas definições do browser/telemóvel."}
        </p>
        {push.state === "off" && (
          <Btn className="h-9 px-4" onClick={push.enable}>
            Ativar avisos
          </Btn>
        )}
        <button
          type="button"
          aria-label="Esconder"
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem("brida-push-banner", "0");
            } catch {}
          }}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Cartão no separador "Instalar App" com o estado e o botão de teste. */
export function PushCard({ push }: { push: ReturnType<typeof usePush> }) {
  const [devices, setDevices] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    mgrPushDevices().then(setDevices);
  }, [push.state]);

  return (
    <Card className="space-y-3">
      <p className="font-medium">Avisos de novas marcações</p>
      <p className="text-sm text-muted-foreground">
        {push.state === "on" && "✓ Este aparelho recebe um aviso sempre que um cliente marca, confirma ou cancela — mesmo com a app fechada."}
        {push.state === "off" && "Desligado neste aparelho."}
        {push.state === "needs-install" && "No iPhone, instale primeiro o painel no ecrã principal (instruções acima) e abra-o por esse ícone."}
        {push.state === "denied" && "Bloqueado nas definições do aparelho. Permita notificações para este site e volte aqui."}
        {push.state === "unsupported" && "Este browser não suporta notificações push."}
        {push.state === "loading" && "A verificar…"}
        {devices !== null && ` Aparelhos com avisos: ${devices}.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {push.state === "off" && <Btn onClick={push.enable}>Ativar avisos</Btn>}
        {push.state === "on" && (
          <>
            <Btn
              onClick={async () => {
                const r = await mgrTestPush();
                setMsg(r.ok ? "Enviado — deve chegar em segundos." : r.error);
              }}
            >
              Enviar aviso de teste
            </Btn>
            <Btn variant="ghost" onClick={push.disable}>
              Desligar neste aparelho
            </Btn>
          </>
        )}
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </div>
    </Card>
  );
}
