import "server-only";
import OpenAI from "openai";
import { LOCALE_INFO, type Locale } from "@/lib/i18n/locales";

/**
 * Traduz um objeto de textos (strings, listas, {value,label}, depoimentos) para outra
 * língua, mantendo a estrutura. Nomes próprios, números, emojis e símbolos ficam iguais.
 * Devolve null se a IA não estiver disponível (sem chave/sem créditos).
 */
export async function translateObject<T extends Record<string, unknown>>(obj: T, to: Locale): Promise<T | null> {
  if (!process.env.OPENAI_API_KEY || !Object.keys(obj).length) return null;
  try {
    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `Translate the JSON values from European Portuguese into ${LOCALE_INFO[to].aiName} for a premium hair salon website. ` +
            "Return JSON with exactly the same keys and structure. Keep people's names, place names, brand names, numbers, emojis and symbols unchanged. " +
            "Do not translate object keys. Keep it short, warm and natural.",
        },
        { role: "user", content: JSON.stringify(obj) },
      ],
    });
    const out = JSON.parse(r.choices[0]?.message?.content ?? "{}");
    // só aceita as chaves pedidas, com o mesmo tipo
    const clean: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      if (k in out && typeof out[k] === typeof obj[k] && Array.isArray(out[k]) === Array.isArray(obj[k])) clean[k] = out[k];
    }
    return clean as T;
  } catch (e) {
    console.error("[translate]", to, (e as Error).message);
    return null;
  }
}
