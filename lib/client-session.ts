import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { one } from "@/lib/db";

// Perfil do cliente guardado no próprio aparelho: um cookie httpOnly assinado que
// liga o aparelho à ficha. Sem senhas. Só é emitido para fichas novas ou quando o
// email e o aniversário coincidem com os da ficha (ver resolveClient).

const COOKIE = "brida_cliente";
const MAX_AGE = 2 * 365 * 24 * 3600;

function secret() {
  const s = process.env.MANAGER_SESSION_SECRET || process.env.DATA_ENCRYPTION_KEY;
  if (!s) throw new Error("MANAGER_SESSION_SECRET não definido");
  return `${s}:cliente`;
}
const sign = (p: string) => createHmac("sha256", secret()).update(p).digest("base64url");

export async function rememberClient(profileId: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `c1.${profileId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function forgetClient() {
  (await cookies()).delete(COOKIE);
}

/** id da ficha deste aparelho, ou null. */
export async function currentClientId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [v, id, exp] = payload.split(".");
  if (v !== "c1" || !/^[0-9a-f-]{36}$/i.test(id) || Number(exp) < Date.now() / 1000) return null;
  return id;
}

export type ClientMe = { id: string; name: string; phone: string | null; email: string | null; birthDate: string | null; stamps: number };

export async function currentClient(): Promise<ClientMe | null> {
  const id = await currentClientId();
  if (!id) return null;
  const p = await one<{ id: string; name: string; phone: string | null; email: string | null; birth_date: string | null; loyalty_points: number }>(
    `select id, name, phone, email, birth_date::text, loyalty_points from public.profiles where id = $1 and role = 'client'`,
    [id],
  );
  return p ? { id: p.id, name: p.name, phone: p.phone, email: p.email, birthDate: p.birth_date, stamps: p.loyalty_points } : null;
}
