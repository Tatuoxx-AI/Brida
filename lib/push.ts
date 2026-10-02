import "server-only";
import webpush from "web-push";
import { exec, query } from "@/lib/db";

// Notificações push para os aparelhos do gerente (o telemóvel da dona com o painel
// instalado). Chegam mesmo com a app fechada. Aparelhos que deixaram de existir
// (a Apple/Google respondem 404/410) são apagados sozinhos.

let configured = false;
function setup(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

/** Envia para todos os aparelhos registados. Devolve quantos receberam. */
export async function pushToManagers(payload: PushPayload): Promise<number> {
  if (!setup()) return 0;
  const subs = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    `select id, endpoint, p256dh, auth from public.push_subscriptions`,
  );
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        sent++;
        await exec(`update public.push_subscriptions set last_ok_at = now() where id = $1`, [s.id]);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await exec(`delete from public.push_subscriptions where id = $1`, [s.id]);
        } else {
          console.error("[push]", status, (e as Error).message);
        }
      }
    }),
  );
  return sent;
}
