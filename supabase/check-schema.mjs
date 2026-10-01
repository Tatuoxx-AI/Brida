// Valida supabase/schema.sql num PostgreSQL em WASM (PGlite), sem Docker nem Supabase.
// Simula o mínimo do Supabase (roles, auth.uid(), storage, publicação realtime) e
// corre cenários de agendamento, RLS e fidelidade. Uso: npm run db:check
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const db = await PGlite.create({ extensions: { btree_gist, pg_trgm } });

const SHIM = await readFile(new URL("./local-shim.sql", import.meta.url), "utf8");

let failures = 0;
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => { failures++; console.log("  ✗", msg); };

async function expectError(label, sql, code) {
  try {
    await db.exec(sql);
    fail(`${label} — devia falhar com ${code}`);
  } catch (e) {
    e.message.includes(code) ? ok(label) : fail(`${label} — erro inesperado: ${e.message}`);
  }
}

// Executa como utilizador autenticado (RLS ativo) e volta a superuser no fim.
async function asUser(userId, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

console.log("1) Shim Supabase + schema");
await db.exec(SHIM);
const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
await db.exec(schema);
ok("schema.sql aplicado sem erros");
await db.exec(await readFile(new URL("./seed.sql", import.meta.url), "utf8"));
ok("seed.sql aplicado sem erros");

console.log("2) Dados de teste");
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values
    ('00000000-0000-0000-0000-00000000000a', 'admin@teste.local', now()),
    ('00000000-0000-0000-0000-00000000000b', 'ana@teste.local',   now()),
    ('00000000-0000-0000-0000-00000000000c', 'rui@teste.local',   now());
  update public.profiles set role = 'admin', name = 'Admin', commission_rate = 40
   where user_id = '00000000-0000-0000-0000-00000000000a';
  insert into public.profiles (id, role, name) values ('00000000-0000-0000-0000-0000000000f1', 'staff', 'Profissional 1');
  insert into public.services (id, name, category, duration_minutes, price, is_addon) values
    ('00000000-0000-0000-0000-000000000051', 'Corte feminino', 'corte',      45, 30, false),
    ('00000000-0000-0000-0000-000000000052', 'Hidratação',     'tratamento', 30, 20, true);
  insert into public.staff_services (staff_id, service_id)
    select '00000000-0000-0000-0000-0000000000f1', id from public.services;
  -- secção 4 testa o modo com sinal; a secção 5 volta ao modo por omissão (sem sinal)
  update public.salon_settings set deposit_percent = 20;
  insert into public.off_peak_discounts (name, weekday, start_time, end_time, discount_percent)
    values ('Terça de manhã', 2, '09:00', '12:00', 15);
`);
const nProfiles = (await db.query(`select count(*)::int n from public.profiles where user_id is not null`)).rows[0].n;
nProfiles === 3 ? ok("signup confirmado cria ficha (trigger auth.users)") : fail(`fichas ligadas: ${nProfiles}`);

// próxima terça-feira (dia aberto, com desconto de manhã)
const { rows: [{ d }] } = await db.query(
  `select (current_date + ((9 - extract(dow from current_date)::int) % 7 + 7))::text d`);

console.log("3) Disponibilidade");
const svc = `array['00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000052']::uuid[]`;
const slots = await db.query(`select * from public.get_available_slots('${d}', ${svc})`);
slots.rows.length > 0 ? ok(`${slots.rows.length} horários livres em ${d}`) : fail("sem horários");
const first = slots.rows[0];
Number(first.discount_percent) === 15 ? ok("desconto de baixa procura aplicado ao slot das 09:00") : fail(`desconto ${first.discount_percent}`);
(new Date(first.slot_end) - new Date(first.slot_start)) / 60000 === 75 ? ok("duração = soma dos serviços (75 min)") : fail("duração errada");

const month = await db.query(`select * from public.get_month_availability(current_date, current_date + 13, ${svc})`);
const tuesday = month.rows.find((r) => String(r.day.toISOString?.() ?? r.day).startsWith(d));
const sunday = month.rows.find((r) => new Date(r.day).getUTCDay() === 0);
month.rows.length === 14 && tuesday?.free_slots === slots.rows.length && sunday?.is_closed
  ? ok(`resumo do mês: 14 dias, ${tuesday.free_slots} vagas em ${d}, domingo fechado`)
  : fail(JSON.stringify(month.rows.slice(0, 3)));

console.log("4) Marcação");
const start = new Date(first.slot_start).toISOString();
const booked = await db.query(
  `select * from public.book_appointment(${svc}, '${start}', null, null, 'Cliente balcão', '+351900000000', 'ai_chat')`);
const ap = booked.rows[0];
ap.status === "pending" && Number(ap.total_price) === 42.5 && Number(ap.deposit_amount) === 8.5
  ? ok("pré-agendamento pending, total 42,50 (50 − 15%), sinal 8,50 (20% do total)")
  : fail(JSON.stringify({ status: ap.status, total: ap.total_price, deposit: ap.deposit_amount }));
const nItems = (await db.query(`select count(*)::int n from public.appointment_services where appointment_id = '${ap.id}'`)).rows[0].n;
nItems === 2 ? ok("serviço principal + add-on gravados") : fail(`itens: ${nItems}`);

await expectError("mesmo horário recusado", `select public.book_appointment(${svc}, '${start}', null, null, 'Outro', null)`, "SLOT_UNAVAILABLE");
await expectError("sobreposição impedida pela base (exclusion constraint)", `
  insert into public.appointments (guest_name, staff_id, service_id, start_time, end_time, status)
  values ('X', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000051',
          '${start}'::timestamptz + interval '30 min', '${start}'::timestamptz + interval '90 min', 'confirmed')`,
  "appointments_no_overlap");

const after = await db.query(`select count(*)::int n from public.get_available_slots('${d}', ${svc}) where slot_start = '${start}'`);
after.rows[0].n === 0 ? ok("horário ocupado sai da lista") : fail("horário continua livre");

await db.exec(`update public.appointments set hold_expires_at = now() - interval '1 min' where id = '${ap.id}'`);
const back = await db.query(`select count(*)::int n from public.get_available_slots('${d}', ${svc}) where slot_start = '${start}'`);
back.rows[0].n === 1 ? ok("hold expirado liberta o horário") : fail("hold expirado não libertou");

console.log("5) Cliente autenticado + RLS (sem sinal, confirmação por WhatsApp)");
await db.exec(`update public.salon_settings set deposit_percent = 0`);
const ANA = "00000000-0000-0000-0000-00000000000b";
const RUI = "00000000-0000-0000-0000-00000000000c";
const anaBook = await asUser(ANA, `select * from public.book_appointment(${svc}, '${start}', null, '00000000-0000-0000-0000-0000000000f1')`);
const anaAp = anaBook.rows[0];
const anaProfile = (await db.query(`select id from public.profiles where user_id = '${ANA}'`)).rows[0].id;
anaAp.client_id === anaProfile ? ok("cliente marca sempre para si (p_client_id ignorado)") : fail("client_id errado");
anaAp.status === "pending" && anaAp.hold_expires_at === null && Number(anaAp.deposit_amount) === 0 && /^[0-9A-F]{8}$/.test(anaAp.code)
  ? ok(`sem pagamento: pending sem prazo, código #${anaAp.code} para confirmar`)
  : fail(JSON.stringify({ s: anaAp.status, h: anaAp.hold_expires_at, d: anaAp.deposit_amount, c: anaAp.code }));
const req = await db.query(`select title from public.admin_events where appointment_id = '${anaAp.id}' and type = 'appointment_requested'`);
req.rows.length === 1 ? ok(`painel avisado: "${req.rows[0].title}"`) : fail("sem evento appointment_requested");

const ruiSees = await asUser(RUI, `select count(*)::int n from public.appointments`);
ruiSees.rows[0].n === 0 ? ok("outro cliente não vê agendamentos alheios") : fail(`rui vê ${ruiSees.rows[0].n}`);
const anaSees = await asUser(ANA, `select count(*)::int n from public.appointments`);
anaSees.rows[0].n === 1 ? ok("cliente vê só os seus") : fail(`ana vê ${anaSees.rows[0].n}`);
const adminSees = await asUser("00000000-0000-0000-0000-00000000000a", `select count(*)::int n from public.appointments`);
adminSees.rows[0].n === 2 ? ok("admin vê todos") : fail(`admin vê ${adminSees.rows[0].n}`);

const upd = await asUser(ANA, `update public.appointments set status = 'confirmed' where id = '${anaAp.id}' returning id`);
upd.rows.length === 0 ? ok("cliente não altera agendamento diretamente") : fail("cliente alterou status");

try {
  await asUser(ANA, `update public.profiles set role = 'admin' where user_id = '${ANA}'`);
  fail("cliente promoveu-se a admin");
} catch (e) {
  e.message.includes("PERMISSION_DENIED") ? ok("cliente não se promove a admin") : fail(e.message);
}
try {
  await asUser(RUI, `select public.cancel_appointment('${anaAp.id}')`);
  fail("cancelou agendamento alheio");
} catch (e) {
  e.message.includes("PERMISSION_DENIED") ? ok("cliente não cancela agendamento alheio") : fail(e.message);
}

console.log("6) Confirmação, eventos e fidelidade");
await db.exec(`update public.appointments set status = 'confirmed' where id = '${anaAp.id}'`);
const ev = await db.query(`select type, body from public.admin_events order by id`);
ev.rows.at(-1).type === "appointment_confirmed" ? ok(`confirmação no painel: "${ev.rows.at(-1).body}"`) : fail("sem evento de confirmação");
const conf = (await db.query(`select confirmed_at from public.appointments where id = '${anaAp.id}'`)).rows[0];
conf.confirmed_at ? ok("confirmed_at preenchido") : fail("confirmed_at vazio");

await db.exec(`update public.appointments set status = 'completed' where id = '${anaAp.id}'`);
await db.exec(`update public.appointments set status = 'in_progress' where id = '${anaAp.id}'`);
await db.exec(`update public.appointments set status = 'completed' where id = '${anaAp.id}'`);
const pts = (await db.query(`select loyalty_points from public.profiles where id = '${anaProfile}'`)).rows[0].loyalty_points;
pts === 1 ? ok("carimbo atribuído uma única vez por visita") : fail(`carimbos: ${pts}`);

const rev = await asUser(ANA, `insert into public.reviews (appointment_id, rating, feedback) values ('${anaAp.id}', 5, 'Top') returning staff_id`);
rev.rows[0].staff_id ? ok("cliente avalia o seu atendimento concluído") : fail("avaliação sem staff");

const fin = await db.query(`select * from public.v_staff_commissions`);
fin.rows.length === 1 && Number(fin.rows[0].revenue) === 42.5 ? ok("view de comissões") : fail(JSON.stringify(fin.rows));

await db.exec(`set role anon; select count(*) from public.public_staff; reset role;`);
ok("anon lê public_staff");

console.log("7) Dados pessoais fechados ao público (anon)");
for (const t of ["profiles", "appointments", "client_notes", "integration_secrets", "manager_notes", "loyalty_transactions"]) {
  try {
    await db.exec(`set role anon; select * from public.${t} limit 1;`);
    fail(`anon conseguiu ler ${t}`);
  } catch (e) {
    e.message.includes("permission denied") ? ok(`anon não lê ${t}`) : fail(`${t}: ${e.message}`);
  } finally {
    await db.exec(`reset role;`);
  }
}
try {
  await asUser(ANA, `select * from public.integration_secrets`);
  fail("cliente autenticado leu credenciais");
} catch (e) {
  e.message.includes("permission denied") ? ok("cliente autenticado não lê credenciais") : fail(e.message);
}

console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
