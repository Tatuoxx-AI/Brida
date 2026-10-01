"use client";

import { useEffect, useState } from "react";
import { mgrAutomation, mgrSaveSecrets, mgrSetToggle, mgrTestTelegram, type MgrAutomation } from "@/actions/manager";
import { Btn, Card, Field, useFlash } from "./ui";
import { Toggle } from "./ui";

const TOGGLES: { key: "auto_confirm_whatsapp" | "reminder_24h" | "birthday_message" | "ai_whatsapp_reply" | "telegram_notify"; title: string; text: string; needs: "whatsapp" | "telegram" }[] = [
  { key: "auto_confirm_whatsapp", title: "Confirmação automática via WhatsApp", text: "Assim que alguém marca, envia a mensagem para responder SIM ou NÃO.", needs: "whatsapp" },
  { key: "reminder_24h", title: "Lembrete 24h antes", text: "Avisa a cliente um dia antes do horário marcado.", needs: "whatsapp" },
  { key: "birthday_message", title: "Mensagem de aniversário", text: "Envia parabéns no dia de anos da cliente (com data de nascimento na ficha).", needs: "whatsapp" },
  { key: "ai_whatsapp_reply", title: "Assistente responde no WhatsApp", text: "A assistente responde às mensagens e marca horários, a qualquer hora.", needs: "whatsapp" },
  { key: "telegram_notify", title: "Notificar novas marcações no Telegram", text: "Um bot avisa-a no Telegram sempre que houver uma marcação nova, do site ou da assistente.", needs: "telegram" },
];

export function AutomationTab() {
  const [a, setA] = useState<MgrAutomation | null>(null);
  const [wa, setWa] = useState({ whatsapp_phone_number_id: "", whatsapp_access_token: "", whatsapp_app_secret: "", whatsapp_verify_token: "" });
  const [tg, setTg] = useState({ telegram_bot_token: "", telegram_chat_id: "" });
  const flashWa = useFlash();
  const flashTg = useFlash();

  const load = () =>
    mgrAutomation().then((r) => {
      setA(r);
      setWa((w) => ({ ...w, whatsapp_phone_number_id: r.whatsapp_phone_number_id, whatsapp_verify_token: r.whatsapp_verify_token, whatsapp_access_token: "", whatsapp_app_secret: "" }));
      setTg((t) => ({ ...t, telegram_chat_id: r.telegram_chat_id, telegram_bot_token: "" }));
    });
  useEffect(() => {
    load();
  }, []);
  if (!a) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  const waReady = !!a.whatsapp_phone_number_id && !!a.whatsapp_token_set;
  const tgReady = !!a.telegram_token_set && !!a.telegram_chat_id;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {TOGGLES.map((t) => {
        const ready = t.needs === "whatsapp" ? waReady : tgReady;
        return (
          <Card key={t.key} className="flex items-start gap-4 p-4 sm:p-5">
            <div className="flex-1">
              <p className="font-medium">{t.title}</p>
              <p className="text-sm text-muted-foreground">{t.text}</p>
              {!ready && a[t.key] && (
                <p className="mt-1 text-xs text-amber-300">Ligado, mas falta configurar o {t.needs === "whatsapp" ? "WhatsApp Business" : "Telegram"} abaixo.</p>
              )}
            </div>
            <Toggle
              on={a[t.key]}
              label={t.title}
              onChange={async (v) => {
                setA({ ...a, [t.key]: v });
                await mgrSetToggle(t.key, v);
              }}
            />
          </Card>
        );
      })}

      <Card className="mt-6 space-y-4">
        <div>
          <p className="text-lg font-medium">WhatsApp Business</p>
          <p className="text-sm text-muted-foreground">
            Da app no Meta for Developers → WhatsApp → Configuração da API. O webhook a registar na Meta é{" "}
            <code className="text-gold">/api/webhooks/whatsapp</code> com o “Verify token” abaixo.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number ID" placeholder="ex: 123456789012345" value={wa.whatsapp_phone_number_id} onChange={(e) => setWa({ ...wa, whatsapp_phone_number_id: e.target.value })} />
          <Field label="Access token" type="password" autoComplete="off" placeholder={a.whatsapp_token_set ?? "token da Meta"} value={wa.whatsapp_access_token} onChange={(e) => setWa({ ...wa, whatsapp_access_token: e.target.value })} />
          <Field label="App secret" type="password" autoComplete="off" placeholder={a.whatsapp_app_secret_set ? "•••• guardado" : "para validar o webhook"} value={wa.whatsapp_app_secret} onChange={(e) => setWa({ ...wa, whatsapp_app_secret: e.target.value })} />
          <Field label="Verify token" placeholder="uma palavra secreta à sua escolha" value={wa.whatsapp_verify_token} onChange={(e) => setWa({ ...wa, whatsapp_verify_token: e.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground">
          Campos de senha em branco mantêm o valor guardado; escreva “-” para apagar. A Meta só deixa escrever primeiro com um modelo de mensagem aprovado.
        </p>
        <div className="flex items-center gap-3">
          <Btn onClick={async () => (flashWa.show(await mgrSaveSecrets(wa)), load())}>Guardar WhatsApp</Btn>
          {flashWa.node}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-lg font-medium">Telegram</p>
          <p className="text-sm text-muted-foreground">Crie um bot com o @BotFather, envie-lhe uma mensagem e use o seu chat id (ex.: via @userinfobot).</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bot token" type="password" autoComplete="off" placeholder={a.telegram_token_set ?? "token do bot"} value={tg.telegram_bot_token} onChange={(e) => setTg({ ...tg, telegram_bot_token: e.target.value })} />
          <Field label="Chat ID" placeholder="ex: 123456789" value={tg.telegram_chat_id} onChange={(e) => setTg({ ...tg, telegram_chat_id: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={async () => (flashTg.show(await mgrSaveSecrets(tg)), load())}>Guardar Telegram</Btn>
          <Btn variant="ghost" disabled={!tgReady} onClick={async () => flashTg.show(await mgrTestTelegram(), "Mensagem de teste enviada ✓")}>
            Enviar teste
          </Btn>
          {flashTg.node}
        </div>
      </Card>
    </div>
  );
}
