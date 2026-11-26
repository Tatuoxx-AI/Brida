// Prova a migração 008 (agente de WhatsApp) num PostgreSQL em WASM, sem tocar na base real.
//
// O que se prova, sobretudo, é a falha de segurança corrigida: chamadas pelo
// servidor (auth.uid() nulo) a cancel/reschedule_appointment saltavam a
// verificação de dono e o prazo de cancelamento. As funções agent_* recebem o
// cliente explicitamente (identificado pelo telefone do WhatsApp) e fazem
// sempre as duas verificações.
//
// Uso: npm run db:check-008
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
async function deveFalhar(label, sql, codigo) {
  try {
    await db.query(sql);
    nao(`${label} — devia falhar com ${codigo}`);
  } catch (e) {
    e.message.includes(codigo) ? ok(label) : nao(`${label} — erro inesperado: ${e.message}`);
  }
}

console.log("1) schema + seed + 008 outra vez");
await db.exec(await ler("local-shim.sql"));
await db.exec(await ler("schema.sql"));
await db.exec(await ler("seed.sql"));
await db.exec(await ler("migrations-008-agente.sql"));
ok("schema.sql, seed.sql e a 008 (segunda vez) aplicados sem erros");

console.log("2) Dados de teste");
const STAFF = "00000000-0000-0000-0000-0000000008f1";
const SVC = "00000000-0000-0000-0000-000000000851";
const ANA = "00000000-0000-0000-0000-0000000008a1";
const RUI = "00000000-0000-0000-0000-0000000008b1";
await db.exec(`
  insert into public.profiles (id, role, name) values ('${STAFF}', 'staff', 'Profissional 008');
  insert into public.profiles (id, role, name, phone) values
    ('${ANA}', 'client', 'Ana 008', '+351910000801'),
    ('${RUI}', 'client', 'Rui 008', '+351910000802');
  insert into public.services (id, name, category, duration_minutes, price, is_addon)
    values ('${SVC}', 'Corte 008', 'corte', 30, 20, false);
  insert into public.staff_services (staff_id, service_id) values ('${STAFF}', '${SVC}');
  update public.salon_settings set deposit_percent = 0, cancellation_window_hours = 24;
`);
// próxima terça-feira daqui a pelo menos uma semana (dia aberto, longe do prazo)
const { rows: [{ d }] } = await db.query(
  `select (current_date + ((9 - extract(dow from current_date)::int) % 7 + 7))::text d`);
const slots = (await db.query(`select slot_start from public.get_available_slots('${d}', array['${SVC}']::uuid[], '${STAFF}')`)).rows;
slots.length >= 6 ? ok(`${slots.length} horários livres em ${d}`) : nao(`poucos horários: ${slots.length}`);
const iso = (r) => new Date(r.slot_start).toISOString();
const marcar = async (cliente, inicio) =>
  (await db.query(
    `select * from public.book_appointment(array['${SVC}']::uuid[], '${inicio}', '${STAFF}', '${cliente}', null, null, 'whatsapp', null)`,
  )).rows[0];
const anaAp = await marcar(ANA, iso(slots[0]));
const ruiAp = await marcar(RUI, iso(slots[2]));
ok(`marcações: Ana #${anaAp.code}, Rui #${ruiAp.code}`);

console.log("3) Listar só as marcações do próprio cliente");
const lista = (await db.query(`select * from public.agent_client_appointments('${ANA}')`)).rows;
lista.length === 1 && lista[0].code === anaAp.code && lista[0].services === "Corte 008" && lista[0].staff_name === "Profissional 008"
  ? ok("Ana vê só a sua marcação, com serviço e profissional")
  : nao(JSON.stringify(lista));

console.log("4) Dono: ninguém mexe na marcação de outro telefone");
await deveFalhar("Ana não cancela a marcação do Rui", `select public.agent_cancel_appointment('${ruiAp.code}', '${ANA}')`, "NOT_FOUND");
await deveFalhar("Ana não remarca a marcação do Rui", `select public.agent_reschedule_appointment('${ruiAp.code}', '${ANA}', '${iso(slots[4])}')`, "NOT_FOUND");
await deveFalhar("sem cliente não há cancelamento", `select public.agent_cancel_appointment('${anaAp.code}', null)`, "PERMISSION_DENIED");
await deveFalhar("sem cliente não há remarcação", `select public.agent_reschedule_appointment('${anaAp.code}', null, '${iso(slots[4])}')`, "PERMISSION_DENIED");
const ruiDepois = (await db.query(`select status from public.appointments where id = '${ruiAp.id}'`)).rows[0];
ruiDepois.status !== "cancelled" ? ok("a marcação do Rui ficou intacta") : nao("a marcação do Rui foi cancelada");

console.log("5) Prazo de cancelamento (24 h)");
const perto = (await db.query(
  `insert into public.appointments (client_id, staff_id, service_id, start_time, end_time, status)
   values ('${ANA}', '${STAFF}', '${SVC}', now() + interval '3 hours', now() + interval '210 minutes', 'confirmed')
   returning code`,
)).rows[0].code;
await deveFalhar("não cancela a menos de 24 h", `select public.agent_cancel_appointment('${perto}', '${ANA}')`, "CANCELLATION_WINDOW");
await deveFalhar("não remarca a menos de 24 h", `select public.agent_reschedule_appointment('${perto}', '${ANA}', '${iso(slots[4])}')`, "CANCELLATION_WINDOW");

console.log("6) Remarcar e cancelar a própria marcação");
const novo = iso(slots[4]);
const rem = (await db.query(`select * from public.agent_reschedule_appointment('${anaAp.code}', '${ANA}', '${novo}')`)).rows[0];
new Date(rem.start_time).toISOString() === novo ? ok("remarcada para o novo horário") : nao(`start ${rem.start_time}`);
await deveFalhar("não remarca para um horário ocupado", `select public.agent_reschedule_appointment('${anaAp.code}', '${ANA}', '${iso(slots[2])}')`, "SLOT_UNAVAILABLE");
const can = (await db.query(`select * from public.agent_cancel_appointment('#${anaAp.code.toLowerCase()}', '${ANA}', 'teste')`)).rows[0];
can.status === "cancelled" && can.cancelled_by === ANA ? ok("cancelada (código com # e minúsculas aceite)") : nao(JSON.stringify(can));
await deveFalhar("não cancela duas vezes", `select public.agent_cancel_appointment('${anaAp.code}', '${ANA}')`, "INVALID_STATUS");

console.log("6b) Confirmar (\"CONFIRMAR #código\" enviado pelo site)");
const pend = (await db.query(
  `insert into public.appointments (client_id, staff_id, service_id, start_time, end_time, status)
   values ('${ANA}', '${STAFF}', '${SVC}', '${iso(slots[8])}', '${iso(slots[8])}'::timestamptz + interval '30 min', 'pending')
   returning code`,
)).rows[0].code;
await deveFalhar("Rui não confirma a marcação da Ana", `select public.agent_confirm_appointment('${pend}', '${RUI}')`, "NOT_FOUND");
const conf = (await db.query(`select * from public.agent_confirm_appointment('#${pend}', '${ANA}')`)).rows[0];
conf.status === "confirmed" ? ok("Ana confirma a sua marcação pendente") : nao(JSON.stringify(conf));
const conf2 = (await db.query(`select * from public.agent_confirm_appointment('${pend}', '${ANA}')`)).rows[0];
conf2.status === "confirmed" ? ok("confirmar duas vezes não dá erro (já confirmada)") : nao(JSON.stringify(conf2));
const comSinal = (await db.query(
  `insert into public.appointments (client_id, staff_id, service_id, start_time, end_time, status, deposit_amount)
   values ('${ANA}', '${STAFF}', '${SVC}', '${iso(slots[10])}', '${iso(slots[10])}'::timestamptz + interval '30 min', 'pending', 5)
   returning code`,
)).rows[0].code;
await deveFalhar("com sinal por pagar não confirma por mensagem", `select public.agent_confirm_appointment('${comSinal}', '${ANA}')`, "DEPOSIT_REQUIRED");

console.log("7) Só o servidor chama as funções do agente");
for (const role of ["anon", "authenticated"]) {
  for (const f of [
    `public.agent_client_appointments('${ANA}')`,
    `public.agent_cancel_appointment('${ruiAp.code}', '${RUI}')`,
    `public.agent_reschedule_appointment('${ruiAp.code}', '${RUI}', '${iso(slots[5])}')`,
    `public.agent_confirm_appointment('${ruiAp.code}', '${RUI}')`,
  ]) {
    try {
      await db.exec(`set role ${role}; select ${f};`);
      nao(`${role} executou ${f.split("(")[0]}`);
    } catch (e) {
      e.message.includes("permission denied") ? ok(`${role} não executa ${f.split("(")[0]}`) : nao(`${role}: ${e.message}`);
    } finally {
      await db.exec(`reset role;`);
    }
  }
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
