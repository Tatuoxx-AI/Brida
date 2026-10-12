// Prova a migração 007 num PostgreSQL em WASM, sem tocar na base real.
//
// Faz o mesmo que o check-schema.mjs mas só o necessário para os convites —
// o completo rebenta com "out of memory: Zone" nesta máquina, e isso já
// acontecia antes desta migração (confirmado com o schema de HEAD).
//
// Uso: node supabase/check-007.mjs
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const db = await PGlite.create({ extensions: { btree_gist, pg_trgm } });
const ler = (f) => readFile(new URL(`./${f}`, import.meta.url), "utf8");

let falhas = 0;
const ok = (m) => console.log("  ✓", m);
const nao = (m) => {
  falhas++;
  console.log("  ✗", m);
};
const eq = (label, got, want) => (String(got) === String(want) ? ok(`${label} = ${got}`) : nao(`${label} = ${got}, esperava ${want}`));

console.log("1) schema + seed");
await db.exec(await ler("local-shim.sql"));
await db.exec(await ler("schema.sql"));
await db.exec(await ler("seed.sql"));
ok("schema.sql e seed.sql aplicados (já com a 007 lá dentro)");

// A migração tem de poder correr OUTRA VEZ sobre uma base que já a tem.
console.log("\n2) a migração é idempotente");
try {
  await db.exec(await ler("migrations-007-convites.sql"));
  ok("migrations-007 corre sobre uma base que já a tem, sem erro");
} catch (e) {
  nao(`migrations-007 falhou na segunda passagem: ${e.message}`);
}

const uma = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const todas = async (sql, params = []) => (await db.query(sql, params)).rows;

console.log("\n3) código de convite");
const anfitria = await uma(
  `insert into public.profiles (name, phone, role) values ('Marta Anfitriã', '+351910000001', 'client') returning id, invite_code`,
);
eq("código tem 8 caracteres", anfitria.invite_code?.length, 8);
const outro = await uma(`insert into public.profiles (name, phone, role) values ('Outra', '+351910000002', 'client') returning invite_code`);
anfitria.invite_code !== outro.invite_code ? ok("os códigos são diferentes entre fichas") : nao("dois códigos iguais");

console.log("\n4) antifraude");
try {
  await db.query(`insert into public.invites (inviter_id, invitee_id) values ($1, $1)`, [anfitria.id]);
  nao("deixou convidar-se a si mesma");
} catch (e) {
  e.message.includes("invites_not_self") ? ok("ninguém se convida a si mesmo") : nao(`erro inesperado: ${e.message}`);
}

const convidada = await uma(`insert into public.profiles (name, phone, role) values ('Ana Convidada', '+351910000003', 'client') returning id`);
await db.query(`insert into public.invites (inviter_id, invitee_id) values ($1, $2)`, [anfitria.id, convidada.id]);
try {
  await db.query(`insert into public.invites (inviter_id, invitee_id) values ($1, $2)`, [outro.id ?? anfitria.id, convidada.id]);
  nao("deixou a mesma pessoa ser convidada duas vezes");
} catch (e) {
  e.message.includes("invites_one_inviter") ? ok("cada ficha só pode ser convidada por uma pessoa") : nao(`erro inesperado: ${e.message}`);
}
try {
  await db.query(`insert into public.profiles (name, phone, role) values ('Clone', $1, 'client')`, ["+351910000003"]);
  nao("deixou criar duas fichas com o mesmo telefone");
} catch {
  ok("o mesmo telefone é sempre a mesma ficha (logo, conta uma vez)");
}

console.log("\n5) a escada sobe com marcações concluídas, e trava");
const servico = await uma(`select id from public.services where active order by sort_order limit 1`);
const staff = await uma(`select id from public.profiles where role in ('staff', 'admin') limit 1`);

/** Cria uma convidada, liga-a à anfitriã e conclui a primeira marcação dela. */
async function convidarEConcluir(n, { segundaVisita = false } = {}) {
  const c = await uma(`insert into public.profiles (name, phone, role) values ($1, $2, 'client') returning id`, [
    `Convidada ${n}`,
    `+3519111${String(n).padStart(5, "0")}`,
  ]);
  await db.query(`insert into public.invites (inviter_id, invitee_id) values ($1, $2)`, [anfitria.id, c.id]);
  const inicio = `2027-03-${String((n % 27) + 1).padStart(2, "0")}T${String(9 + (n % 8)).padStart(2, "0")}:00:00Z`;
  const ap = await uma(
    `insert into public.appointments (client_id, staff_id, service_id, start_time, end_time, status)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '45 min', 'confirmed') returning id`,
    [c.id, staff.id, servico.id, inicio],
  );
  if (segundaVisita) {
    // uma visita concluída ANTES do convite: não pode validar nada
    await db.query(
      `insert into public.appointments (client_id, staff_id, service_id, start_time, end_time, status)
       values ($1, $2, $3, '2026-01-02T09:00:00Z', '2026-01-02T09:45:00Z', 'completed')`,
      [c.id, staff.id, servico.id],
    );
  }
  await db.query(`update public.appointments set status = 'completed' where id = $1`, [ap.id]);
  return c;
}

const degraus = [];
for (let n = 1; n <= 11; n++) {
  await convidarEConcluir(n);
  const p = await uma(`select invite_discount_percent as d, public.invite_level(id) as nivel from public.profiles where id = $1`, [anfitria.id]);
  degraus.push(`${p.nivel}:${Number(p.d)}%`);
}
console.log("   escada:", degraus.join("  "));
const esperado = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => `${n}:${Math.min(50, n * 5)}%`);
degraus.join(" ") === esperado.join(" ") ? ok("+5% por convidada, trava nos 50% a partir da 10.ª") : nao(`escada errada:\n   obtida:   ${degraus.join("  ")}\n   esperada: ${esperado.join("  ")}`);

console.log("\n6) quem já era cliente não conta");
const antes = Number((await uma(`select invite_discount_percent as d from public.profiles where id = $1`, [anfitria.id])).d);
const antigaCliente = await convidarEConcluir(90, { segundaVisita: true });
const depois = Number((await uma(`select invite_discount_percent as d from public.profiles where id = $1`, [anfitria.id])).d);
const estado = (await uma(`select status from public.invites where invitee_id = $1`, [antigaCliente.id])).status;
eq("desconto continua", `${depois}%`, `${antes}%`);
eq("convite de quem já tinha visitas", estado, "pending");

console.log("\n7) o desconto entra na marcação");
await db.query(`update public.profiles set invite_discount_percent = 20 where id = $1`, [convidada.id]);
// Preço a sério: no seed os serviços estão a 0 ("sob consulta") e 0×0,8 = 0
// dava um teste que passava sem provar nada.
await db.query(`update public.services set price = 40 where id = $1`, [servico.id]);
const preco = Number((await uma(`select price from public.services where id = $1`, [servico.id])).price);
const marcada = await uma(
  `select * from public.book_appointment(array[$1]::uuid[], '2027-04-05T10:00:00Z'::timestamptz, $2::uuid, $3::uuid, null, null, 'admin', null)`,
  [servico.id, staff.id, convidada.id],
);
eq("desconto gravado na marcação", Number(marcada.invite_discount_applied), 20);
eq("total", Number(marcada.total_price), Math.round(preco * 0.8 * 100) / 100);

console.log("\n8) modo consumível: gasta e devolve se cancelar");
await db.query(`update public.salon_settings set invite_discount_consumable = true where id = 1`);
await db.query(`update public.profiles set invite_discount_percent = 30 where id = $1`, [convidada.id]);
const m2 = await uma(
  `select * from public.book_appointment(array[$1]::uuid[], '2027-04-06T10:00:00Z'::timestamptz, $2::uuid, $3::uuid, null, null, 'admin', null)`,
  [servico.id, staff.id, convidada.id],
);
eq("depois de marcar", Number((await uma(`select invite_discount_percent as d from public.profiles where id = $1`, [convidada.id])).d), 0);
await db.query(`update public.appointments set status = 'cancelled' where id = $1`, [m2.id]);
eq("depois de cancelar", Number((await uma(`select invite_discount_percent as d from public.profiles where id = $1`, [convidada.id])).d), 30);
await db.query(`update public.salon_settings set invite_discount_consumable = false where id = 1`);

console.log("\n9) busca sem acentos");
await db.query(`insert into public.profiles (name, phone, role) values ('Ana Conceição', '+351919999001', 'client')`);
const achou = await todas(`select name from public.profiles where public.norm_text(name) like '%' || public.norm_text($1) || '%'`, ["conceicao"]);
achou.length === 1 ? ok(`"conceicao" encontra "Ana Conceição"`) : nao(`"conceicao" encontrou ${achou.length}`);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
