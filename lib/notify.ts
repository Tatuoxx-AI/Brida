import "server-only";
import { one } from "@/lib/db";
import { open } from "@/lib/secret-box";

/** Avisa o gerente no Telegram (painel → Automação). Falhas só ficam no log. */
export async function notifyTelegram(text: string): Promise<boolean> {
  const s = await one<{ telegram_bot_token: string | null; telegram_chat_id: string | null }>(
    `select telegram_bot_token, telegram_chat_id from public.integration_secrets where id = 1`,
  );
  const token = open(s?.telegram_bot_token);
  if (!token || !s?.telegram_chat_id) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: s.telegram_chat_id, text }),
    });
    if (!res.ok) console.error("[telegram]", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[telegram]", e);
    return false;
  }
}
