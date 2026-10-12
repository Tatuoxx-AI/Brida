import "server-only";
import { cookies } from "next/headers";
import { exec, one, query } from "@/lib/db";

/**
 * Convites com recompensa em escada.
 *
 * Quem convida tem um código e um QR que levam a /convite/<código>. Quem entra
 * por lá fica ligado a quem convidou — e o convite só conta quando a PRIMEIRA
 * marcação dessa pessoa for dada como concluída pelo salão. A escada e o
 * antifraude vivem no SQL (migrations-007-convites.sql); aqui só se lê, se
 * guarda o código no aparelho e se liga a ficha a quem convidou.
 */

// Cookie e não parâmetro no endereço: entre abrir o QR e marcar há três ou
// quatro páginas, e um ?convite= perdia-se na primeira.
//
// Quem o GRAVA é o middleware, não este ficheiro — um Server Component não
// pode escrever cookies. Aqui só se lê e se apaga.
import { INVITE_CODE_RE, INVITE_COOKIE } from "@/lib/invite-cookie";

export type InviteeRow = {
  name: string;
  status: "pending" | "valid" | "blocked";
  createdAt: string;
  validatedAt: string | null;
};

export type InviteLadder = {
  code: string;
  url: string;
  /** convites válidos (o degrau em que está) */
  level: number;
  /** desconto disponível agora, em % */
  discount: number;
  step: number;
  max: number;
  /** quantos degraus tem a escada (10, com passo 5 e teto 50) */
  steps: number;
  consumable: boolean;
  manual: boolean;
  /** quantas convidadas faltam para o degrau seguinte (null = já está no topo) */
  toNext: number | null;
  nextDiscount: number | null;
  invitees: InviteeRow[];
};

type Settings = { step: number; max: number; consumable: boolean };

async function settings(): Promise<Settings> {
  const s = await one<{ invite_discount_step: number; invite_discount_max: number; invite_discount_consumable: boolean }>(
    `select invite_discount_step, invite_discount_max, invite_discount_consumable from public.salon_settings where id = 1`,
  );
  return {
    step: Number(s?.invite_discount_step ?? 5) || 5,
    max: Number(s?.invite_discount_max ?? 50),
    consumable: !!s?.invite_discount_consumable,
  };
}

export function inviteUrl(code: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return `${base}/convite/${code}`;
}

/** Primeiro nome. Quem convidou não precisa de ver mais do que isso. */
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** A escada de uma ficha: degrau, desconto, quanto falta e quem já convidou. */
export async function ladderFor(clientId: string): Promise<InviteLadder | null> {
  const p = await one<{ invite_code: string; invite_discount_percent: number; invite_discount_manual: boolean }>(
    `select invite_code, invite_discount_percent, invite_discount_manual from public.profiles where id = $1`,
    [clientId],
  );
  if (!p?.invite_code) return null;

  const [s, rows] = await Promise.all([
    settings(),
    query<{ name: string; status: InviteeRow["status"]; created_at: string; validated_at: string | null }>(
      `select pr.name, i.status, i.created_at, i.validated_at
         from public.invites i join public.profiles pr on pr.id = i.invitee_id
        where i.inviter_id = $1
        order by i.created_at desc
        limit 100`,
      [clientId],
    ),
  ]);

  const level = rows.filter((r) => r.status === "valid").length;
  const steps = Math.max(1, Math.round(s.max / s.step));
  const noTopo = level >= steps;

  return {
    code: p.invite_code,
    url: inviteUrl(p.invite_code),
    level,
    discount: Number(p.invite_discount_percent ?? 0),
    step: s.step,
    max: s.max,
    steps,
    consumable: s.consumable,
    manual: !!p.invite_discount_manual,
    toNext: noTopo ? null : 1,
    nextDiscount: noTopo ? null : Math.min(s.max, (level + 1) * s.step),
    invitees: rows.map((r) => ({
      name: firstName(r.name),
      status: r.status,
      createdAt: r.created_at,
      validatedAt: r.validated_at,
    })),
  };
}

/** Quem está por trás de um código de convite. null se não existir. */
export async function inviterByCode(code: string): Promise<{ id: string; name: string; firstName: string } | null> {
  if (!/^[A-Z0-9]{6,16}$/i.test(code)) return null;
  const p = await one<{ id: string; name: string }>(
    `select id, name from public.profiles where invite_code = upper($1) and role = 'client'`,
    [code],
  );
  return p ? { id: p.id, name: p.name, firstName: firstName(p.name) } : null;
}

export async function readInvite(): Promise<string | null> {
  try {
    const v = (await cookies()).get(INVITE_COOKIE)?.value;
    return v && /^[A-Z0-9]{6,16}$/.test(v) ? v : null;
  } catch {
    // fora de um pedido HTTP (cron, webhook) não há cookies — e não faz mal
    return null;
  }
}

async function clearInvite() {
  try {
    (await cookies()).delete(INVITE_COOKIE);
  } catch {
    /* idem */
  }
}

/**
 * Liga a ficha recém-criada a quem a convidou. Nunca lança: um convite que não
 * dá não pode impedir alguém de marcar.
 *
 * As três regras de antifraude estão no SQL (não convidar-se a si mesmo, uma
 * ficha por telefone/email, um só convite por ficha). Aqui fica a quarta, que
 * é de bom senso: não se convida quem já é cliente da casa.
 */
export async function attachInvite(inviteeId: string): Promise<boolean> {
  const code = await readInvite();
  if (!code) return false;
  try {
    const inviter = await inviterByCode(code);
    if (!inviter || inviter.id === inviteeId) {
      await clearInvite();
      return false;
    }
    const jaCliente = await one<{ n: number }>(
      `select count(*)::int as n from public.appointments where client_id = $1 and status = 'completed'`,
      [inviteeId],
    );
    if ((jaCliente?.n ?? 0) > 0) {
      await clearInvite();
      return false;
    }
    const n = await exec(
      `insert into public.invites (inviter_id, invitee_id) values ($1, $2)
       on conflict (invitee_id) do nothing`,
      [inviter.id, inviteeId],
    );
    if (n > 0) await exec(`update public.profiles set invited_by = $2 where id = $1 and invited_by is null`, [inviteeId, inviter.id]);
    await clearInvite();
    return n > 0;
  } catch (e) {
    console.error("[convite] não consegui ligar o convite", e);
    return false;
  }
}
