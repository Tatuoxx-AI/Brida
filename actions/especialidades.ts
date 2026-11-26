"use server";

import { z } from "zod";
import { query } from "@/lib/db";
import { requireManager } from "@/lib/manager-auth";

/**
 * Especialidades da equipa (painel do dono → Equipa).
 *
 * Cada especialidade é um grupo de categorias de serviço. Ligar uma especialidade
 * associa a funcionária a TODOS os serviços dessas categorias (staff_services);
 * desligar retira-os. É a mesma tabela que a agenda do site e o agente de
 * WhatsApp usam para saber quem faz o quê — por isso uma manicure nunca recebe
 * um corte, e quem tem duas especialidades faz as duas.
 */
const ESPECIALIDADES = {
  cabeleireira: { label: "Cabeleireira", categorias: ["corte", "coloracao", "tratamento", "penteado", "barbearia"] },
  manicure: { label: "Manicure", categorias: ["unhas"] },
  esteticista: { label: "Sobrancelhas", categorias: ["sobrancelhas"] },
  // serviços de depilação ficam na categoria "Estética" do painel
  depilacao: { label: "Depilação", categorias: ["estetica"] },
} as const;

export type Especialidade = keyof typeof ESPECIALIDADES;
type Result = { ok: true; message?: string } | { ok: false; error: string };

const Input = z.object({
  staffId: z.string().uuid(),
  especialidade: z.enum(["cabeleireira", "manicure", "esteticista", "depilacao"]),
  ligar: z.boolean(),
});

/** Para cada funcionária: que especialidades estão ligadas (tem pelo menos um serviço da área). */
export async function mgrEspecialidades(): Promise<Record<string, Especialidade[]>> {
  await requireManager();
  const rows = await query<{ staff_id: string; category: string }>(
    `select distinct x.staff_id, s.category::text as category
       from public.staff_services x
       join public.services s on s.id = x.service_id
       join public.profiles p on p.id = x.staff_id and p.role in ('staff', 'admin')`,
  );
  const out: Record<string, Especialidade[]> = {};
  for (const esp of Object.keys(ESPECIALIDADES) as Especialidade[]) {
    const cats: readonly string[] = ESPECIALIDADES[esp].categorias;
    const ids = new Set(rows.filter((r) => cats.includes(r.category)).map((r) => r.staff_id));
    for (const id of ids) (out[id] ??= []).push(esp);
  }
  return out;
}

export async function mgrSetEspecialidade(raw: z.input<typeof Input>): Promise<Result> {
  await requireManager();
  const p = Input.safeParse(raw);
  if (!p.success) return { ok: false, error: "Dados inválidos." };
  const { staffId, especialidade, ligar } = p.data;
  const categorias = [...ESPECIALIDADES[especialidade].categorias];
  const staff = await query<{ id: string }>(`select id from public.profiles where id = $1 and role in ('staff', 'admin')`, [staffId]);
  if (!staff.length) return { ok: false, error: "Funcionária não encontrada." };

  if (ligar) {
    await query(
      `insert into public.staff_services (staff_id, service_id)
       select $1, s.id from public.services s where s.category::text = any($2::text[])
       on conflict do nothing`,
      [staffId, categorias],
    );
  } else {
    await query(
      `delete from public.staff_services x using public.services s
        where x.service_id = s.id and x.staff_id = $1 and s.category::text = any($2::text[])`,
      [staffId, categorias],
    );
  }
  const label = ESPECIALIDADES[especialidade].label;
  return { ok: true, message: ligar ? `${label}: ligada (faz os serviços desta área)` : `${label}: desligada` };
}
