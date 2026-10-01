import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Cifra os tokens das integrações (WhatsApp, Telegram) antes de irem para a base.
// Quem tiver acesso à base (backup, painel do Supabase) vê só "enc:v1:…".
// A chave fica na variável DATA_ENCRYPTION_KEY, fora da base e fora do código.

const PREFIX = "enc:v1:";

function key() {
  const k = process.env.DATA_ENCRYPTION_KEY || process.env.MANAGER_SESSION_SECRET;
  if (!k) throw new Error("DATA_ENCRYPTION_KEY não definido");
  return createHash("sha256").update(k).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** Devolve o texto original; valores antigos sem cifra passam tal e qual. */
export function open(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    console.error("[secret-box] não foi possível decifrar (a chave mudou?)");
    return null;
  }
}
