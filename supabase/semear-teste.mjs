// Põe clientes de treino na base LOCAL (.data/pg) para experimentar a busca por
// nome e o assistente. Nunca toca na base real — recusa-se a correr se houver
// DATABASE_URL no ambiente.
//
// O servidor tem de estar parado: o PGlite com pasta só abre num processo.
//
// Uso: node supabase/semear-teste.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

if (process.env.DATABASE_URL) {
  console.error("Há DATABASE_URL definido. Este script é só para a base local.");
  process.exit(1);
}

const db = await PGlite.create({
  dataDir: path.join(process.cwd(), ".data", "pg"),
  extensions: { btree_gist, pg_trgm },
});
await db.exec(`set timezone to 'UTC'`);

// Cria a base se ainda não existir, em vez de esperar que o servidor o faça:
// assim este script pode correr antes de arrancar o Next e não há dois
// processos a escrever na mesma pasta do PGlite ao mesmo tempo.
const pronta = await db.query(`select to_regclass('public.salon_settings') is not null as ok`);
if (!pronta.rows[0]?.ok) {
  const dir = path.join(process.cwd(), "supabase");
  for (const f of ["local-shim.sql", "schema.sql", "seed.sql"]) {
    await db.exec(await readFile(path.join(dir, f), "utf8"));
  }
  console.log("base local criada (schema + seed)");
}

// Nomes de propósito parecidos: três Anas, um João e uma Joana. É com estes
// que se vê se a busca distingue pessoas e se as sugestões servem para alguma
// coisa.
const PESSOAS = [
  ["Ana Costa", "+351912000111"],
  ["Ana Silva", "+351912000222"],
  ["Ana Conceição", "+351912000333"],
  ["João Pereira", "+351913000444"],
  ["Joana Marques", "+351913000555"],
  ["Mariana Lopes", "+351914000666"],
];

for (const [nome, tel] of PESSOAS) {
  await db.query(
    `insert into public.profiles (name, phone, email, role)
     values ($1, $2, $3, 'client')
     on conflict (phone) where phone is not null do nothing`,
    [nome, tel, `${nome.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}@exemplo.pt`],
  );
}

// Uma visita concluída à Ana Costa, para a lista mostrar "última visita".
const ana = (await db.query(`select id from public.profiles where name = 'Ana Costa'`)).rows[0];
const staff = (await db.query(`select id from public.profiles where role in ('staff','admin') limit 1`)).rows[0];
const servico = (await db.query(`select id from public.services where active order by sort_order limit 1`)).rows[0];
if (ana && staff && servico) {
  await db.query(
    `insert into public.appointments (client_id, staff_id, service_id, start_time, end_time, status)
     select $1, $2, $3, now() - interval '20 days', now() - interval '20 days' + interval '45 min', 'completed'
      where not exists (select 1 from public.appointments where client_id = $1)`,
    [ana.id, staff.id, servico.id],
  );
}

// Preços a sério: o seed traz tudo a 0 ("sob consulta") e com 0 não se vê
// desconto nenhum no cartão de confirmação.
await db.query(`update public.services set price = 35 where price = 0 and not is_addon`);
await db.query(`update public.services set price = 12 where price = 0 and is_addon`);

const n = (await db.query(`select count(*)::int as n from public.profiles where role = 'client'`)).rows[0].n;
const s = (await db.query(`select count(*)::int as n from public.services where active`)).rows[0].n;
console.log(`base local: ${n} clientes, ${s} serviços activos`);
for (const r of (await db.query(`select name, invite_code from public.profiles where role = 'client' order by name`)).rows) {
  console.log(`  ${r.name.padEnd(18)} ${r.invite_code}`);
}
await db.close();
