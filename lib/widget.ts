import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { one, query } from "@/lib/db";

// Widget da agenda no ecrã inicial do telemóvel: resumo do dia por profissional
// (quantas clientes, a primeira e a próxima hora). Sem nomes nem contactos de clientes —
// o widget fica à vista no ecrã do telemóvel.

export type WidgetStaff = { name: string; count: number; pending: number; first: string | null; next: string | null };
export type WidgetAgenda = { salon: string; date: string; weekday: string; total: number; staff: WidgetStaff[]; updatedAt: string };

const TZ = "Europe/Lisbon";

export const hashWidgetToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newWidgetToken = () => `bw_${randomBytes(24).toString("base64url")}`;

/** Confere a chave (Authorization: Bearer …) e regista o último uso. */
export async function checkWidgetToken(token: string): Promise<boolean> {
  if (!/^bw_[\w-]{20,64}$/.test(token)) return false;
  const row = await one<{ id: string }>(
    `update public.widget_tokens set last_used_at = now() where token_hash = $1 returning id`,
    [hashWidgetToken(token)],
  );
  return !!row;
}

export async function getWidgetAgenda(): Promise<WidgetAgenda> {
  const [s, rows] = await Promise.all([
    one<{ name: string; today: string; weekday: string }>(
      `select coalesce((select name from public.salon_settings where id = 1), 'Brida Coiffeur') as name,
              to_char(now() at time zone $1, 'DD/MM') as today,
              extract(dow from now() at time zone $1)::int::text as weekday`,
      [TZ],
    ),
    // todas as profissionais ativas (mesmo sem marcações), pela ordem da equipa
    query<{ name: string; count: number; pending: number; first: string | null; next: string | null }>(
      `select p.name,
              count(a.id)::int as count,
              count(a.id) filter (where a.status = 'pending')::int as pending,
              to_char(min(a.start_time) at time zone $1, 'HH24:MI') as first,
              to_char(min(a.start_time) filter (where a.start_time >= now()) at time zone $1, 'HH24:MI') as next
         from public.profiles p
         left join public.appointments a
           on a.staff_id = p.id
          and a.status in ('pending', 'confirmed', 'in_progress')
          and (a.start_time at time zone $1)::date = (now() at time zone $1)::date
        where p.role in ('staff', 'admin') and p.active
        group by p.id, p.name, p.team_order
        order by p.team_order, p.name`,
      [TZ],
    ),
  ]);
  const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  return {
    salon: s?.name ?? "Brida Coiffeur",
    date: s?.today ?? "",
    weekday: days[Number(s?.weekday ?? 0)],
    total: rows.reduce((t, r) => t + r.count, 0),
    staff: rows,
    updatedAt: new Date().toISOString(),
  };
}
