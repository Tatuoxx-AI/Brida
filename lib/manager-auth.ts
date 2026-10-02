import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Área do gerente: endereço secreto (MANAGER_PATH) + senha (MANAGER_PASSWORD).
// A sessão é um cookie httpOnly assinado com HMAC; nada disto chega ao browser
// do público. O endereço só é revelado pelo servidor (ponto final do título).

const COOKIE = "brida_mgr";
// 1 ano, renovado sempre que o painel abre (mgrKeepAlive): no telemóvel da dona,
// com o painel instalado como app, a sessão nunca expira enquanto for usada.
const MAX_AGE = 365 * 24 * 3600;

export function managerPath(): string | null {
  const p = process.env.MANAGER_PATH?.replace(/^\/+|\/+$/g, "");
  return p && /^[a-z0-9-]{8,64}$/i.test(p) ? `/${p}` : null;
}

function secret() {
  const s = process.env.MANAGER_SESSION_SECRET || process.env.MANAGER_PASSWORD;
  if (!s) throw new Error("MANAGER_PASSWORD não definido");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");
const digest = (v: string) => createHash("sha256").update(v).digest();

export function checkPassword(input: string): boolean {
  const real = process.env.MANAGER_PASSWORD;
  if (!real) return false;
  return timingSafeEqual(digest(input), digest(real));
}

export async function startManagerSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `v1.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // "strict" perdia a sessão ao abrir o painel a partir de uma notificação
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endManagerSession() {
  (await cookies()).delete(COOKIE);
}

export async function isManager(): Promise<boolean> {
  if (!managerPath() || !process.env.MANAGER_PASSWORD) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const i = raw.lastIndexOf(".");
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000;
}

/** Usar no início de TODAS as Server Actions do painel. */
export async function requireManager() {
  if (!(await isManager())) throw new Error("Sessão do painel expirada. Entre de novo.");
}
