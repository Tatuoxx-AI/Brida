// Testa a API /api/agente/* de ponta a ponta contra um servidor LOCAL.
//
// Uso (base local descartável, nunca a de produção):
//   DATABASE_URL= PGLITE_DIR=.data/pg-teste AGENT_API_KEY=dev npx next dev -p 3241
//   node scripts/check-agente-api.mjs http://localhost:3241 dev
//
// Cria, lista, remarca e cancela marcações, e prova que um telefone não mexe
// nas marcações de outro.
import { createHash, createHmac } from "node:crypto";
const BASE = process.argv[2] ?? "http://localhost:3241";
const KEY = process.argv[3] ?? "dev";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("Só corre contra localhost — escreve marcações de teste.");
  process.exit(1);
}

const ANA = "+351910000901";
const RUI = "+351910000902";
let falhas = 0;
const ok = (m) => console.log("  ✓", m);
const nao = (m) => { falhas++; console.log("  ✗", m); };
const check = (cond, label, extra) => (cond ? ok(label) : nao(`${label} ${extra ? JSON.stringify(extra) : ""}`));

/** Igual a canonicalTarget() de lib/agente.ts. */
function canonicalTarget(url) {
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch {}
  const q = [...url.searchParams.entries()].sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1)).map(([k, v]) => k + "=" + v).join("&");
  return q ? path + "?" + q : path;
}

function sign(key, ts, method, pathQ, phone, body) {
  const h = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", key).update([ts, method, pathQ, phone, h].join(String.fromCharCode(10))).digest("hex");
}

/** Pedido assinado como a central faz (src/connectors/brida.ts). */
async function api(method, path, { phone = ANA, key = KEY, body, ts, tamper } = {}) {
  const raw = body ? JSON.stringify(body) : "";
  const t = String(ts ?? Math.floor(Date.now() / 1000));
  const headers = { "content-type": "application/json", "x-agente-ts": t };
  if (phone !== null) headers["x-cliente-telefone"] = phone;
  if (key !== null) headers["x-agente-assinatura"] = sign(key, t, method, canonicalTarget(new URL(BASE + path)), phone ?? "", raw);
  const r = await fetch(BASE + path, { method, headers, body: tamper ?? (raw || undefined) });
  return { status: r.status, data: await r.json().catch(() => null) };
}

console.log("1) Autenticação");
let r = await api("GET", "/api/agente/info", { key: null });
check(r.status === 401, "sem chave → 401", r);
r = await api("GET", "/api/agente/info", { key: "errada" });
check(r.status === 401, "chave errada → 401", r);
r = await api("GET", "/api/agente/info", { phone: "" });
check(r.status === 400 && r.data?.code === "INVALID_PHONE", "sem telefone → 400", r);
r = await api("GET", "/api/agente/info", { ts: Math.floor(Date.now() / 1000) - 120 });
check(r.status === 401, "pedido com mais de 60 s (replay) → 401", r);
r = await api("POST", "/api/agente/handoff", { body: { motivo: "teste" }, tamper: JSON.stringify({ motivo: "outro" }) });
check(r.status === 401, "corpo alterado depois de assinado → 401", r);
r = await api("GET", "/api/agente/info", { phone: "+351910000903", tamper: undefined, key: KEY, ts: undefined }).then(async () => {
  // assinatura feita para um telefone e enviada com outro
  const t = String(Math.floor(Date.now() / 1000));
  const resp = await fetch(BASE + "/api/agente/marcacoes", { headers: { "x-agente-ts": t, "x-cliente-telefone": RUI, "x-agente-assinatura": sign(KEY, t, "GET", "/api/agente/marcacoes", ANA, "") } });
  return { status: resp.status };
});
check(r.status === 401, "trocar o telefone depois de assinado → 401", r);

console.log("2) Informação do salão");
r = await api("GET", "/api/agente/info");
const servico = r.data?.servicos?.find((s) => !s.is_addon);
check(r.status === 200 && servico && r.data.salao?.name, `info: ${r.data?.salao?.name}, ${r.data?.servicos?.length} serviços`, r.status);

console.log("3) Disponibilidade");
const amanha7 = new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10);
r = await api("GET", `/api/agente/disponibilidade?data=${amanha7}&servicos=${servico.id}&dias=7`);
const horarios = (r.data?.dias ?? []).flatMap((d) => d.horarios);
check(r.status === 200 && horarios.length >= 3, `${horarios.length} horários livres numa semana`, r.status);
r = await api("GET", `/api/agente/disponibilidade?data=2026-02-31&servicos=${servico.id}`);
check(r.status === 400, "data inválida → 400", r);

console.log("4) Criar e listar");
r = await api("POST", "/api/agente/marcacoes", { body: { servicos: [servico.id], inicio: horarios[0].inicio, nome: "Ana Teste" } });
const codigo = r.data?.marcacao?.codigo;
check(r.status === 201 && /^[0-9A-F]{8}$/.test(codigo ?? "") && r.data.marcacao.estado === "confirmed", `marcada #${codigo} (confirmada)`, r);
r = await api("POST", "/api/agente/marcacoes", { phone: RUI, body: { servicos: [servico.id], inicio: horarios[0].inicio, nome: "Rui Teste" } });
check(r.status === 409 && r.data?.code === "SLOT_UNAVAILABLE", "mesmo horário para outra pessoa → 409", r);
r = await api("GET", "/api/agente/marcacoes");
check(r.data?.marcacoes?.some((m) => m.codigo === codigo), "Ana vê a sua marcação", r);
r = await api("GET", "/api/agente/marcacoes", { phone: RUI });
check(r.status === 200 && !r.data?.marcacoes?.some((m) => m.codigo === codigo), "Rui não vê a marcação da Ana", r);

r = await api("POST", `/api/agente/marcacoes/${codigo}/confirmar`);
check(r.status === 200 && r.data?.marcacao?.estado === "confirmed", "\"CONFIRMAR #código\" da própria cliente → 200", r);

console.log("5) Segurança: outro telefone não mexe");
r = await api("POST", `/api/agente/marcacoes/${codigo}/confirmar`, { phone: RUI });
check(r.status === 404, "Rui não confirma a marcação da Ana → 404", r);
r = await api("DELETE", `/api/agente/marcacoes/${codigo}`, { phone: RUI });
check(r.status === 404, "Rui não cancela a marcação da Ana → 404", r);
r = await api("PATCH", `/api/agente/marcacoes/${codigo}`, { phone: RUI, body: { inicio: horarios[1].inicio } });
check(r.status === 404, "Rui não remarca a marcação da Ana → 404", r);
r = await api("DELETE", `/api/agente/marcacoes/x'or'1'='1`);
check(r.status === 400, "código malformado → 400", r);

console.log("6) Remarcar e cancelar");
r = await api("PATCH", `/api/agente/marcacoes/${codigo}`, { body: { inicio: horarios[2].inicio } });
check(r.status === 200 && r.data?.marcacao?.inicio === horarios[2].inicio, "Ana remarca", r);
r = await api("DELETE", `/api/agente/marcacoes/%23${codigo.toLowerCase()}?motivo=${encodeURIComponent("doença & febre")}`);
check(r.status === 200 && r.data?.marcacao?.estado === "cancelled", "Ana cancela (#código em minúsculas)", r);
r = await api("DELETE", `/api/agente/marcacoes/${codigo}`);
check(r.status === 409 && r.data?.code === "INVALID_STATUS", "cancelar outra vez → 409", r);

console.log("7) Humano");
r = await api("POST", "/api/agente/handoff", { body: { motivo: "Quer falar sobre coloração", nome: "Ana Teste" } });
// sem push/Telegram configurados na base local não há quem avisar: tem de dizer que falhou
check((r.status === 200 && r.data?.ok) || (r.status === 502 && r.data?.code === "NOTIFY_FAILED"), `pedido de atendimento humano (${r.status})`, r);

console.log("8) Teto de marcações por número");
const CARLA = "+351910000" + String(Date.now()).slice(-3);
let ultimo;
for (let i = 0; i < 4; i++) ultimo = await api("POST", "/api/agente/marcacoes", { phone: CARLA, body: { servicos: [servico.id], inicio: horarios[Math.floor(((i + 1) * horarios.length) / 5)].inicio, nome: "Carla Teste" } });
check(ultimo.status === 409 && ultimo.data?.code === "TOO_MANY_ACTIVE", "4.ª marcação futura do mesmo número → 409", ultimo);
r = await api("GET", "/api/agente/marcacoes", { phone: CARLA });
for (const m of r.data?.marcacoes ?? []) await api("DELETE", `/api/agente/marcacoes/${m.codigo}`, { phone: CARLA });

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
