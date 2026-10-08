// Script do widget para a app Scriptable (iPhone/iPad). Gerado no painel com o endereço do
// site e a chave do aparelho já preenchidos; a pessoa só cola na Scriptable e junta o widget.
// Tamanhos: pequeno (total + 1.ª), médio (até 3 profissionais) e grande (até 8).

export function buildScriptableScript({ apiUrl, token, openUrl }: { apiUrl: string; token: string; openUrl: string }) {
  return `// Brida Coiffeur — agenda de hoje no ecrã inicial
// Widget criado pelo painel. Não partilhe este script: tem a chave deste telemóvel.
const API = ${JSON.stringify(apiUrl)};
const KEY = ${JSON.stringify(token)};
const OPEN = ${JSON.stringify(openUrl)};

const GOLD = new Color("#F6CF57");
const GOLD_DARK = new Color("#B07A12");
const WHITE = new Color("#FFFFFF");
const MUTED = new Color("#FFFFFF", 0.55);
const LINE = new Color("#F6CF57", 0.18);

async function load() {
  const r = new Request(API);
  r.headers = { Authorization: "Bearer " + KEY };
  r.timeoutInterval = 15;
  const data = await r.loadJSON();
  if (r.response.statusCode !== 200) throw new Error(data.error || "Erro " + r.response.statusCode);
  Keychain.set("brida-widget-cache", JSON.stringify(data));
  return data;
}

function cached() {
  return Keychain.contains("brida-widget-cache") ? JSON.parse(Keychain.get("brida-widget-cache")) : null;
}

function base() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color("#17130B"), new Color("#000000")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = OPEN;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

function text(stack, value, size, color, weight) {
  const t = stack.addText(String(value));
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "serif" ? new Font("Georgia-Italic", size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function clientes(n) {
  return n === 1 ? "1 cliente" : n + " clientes";
}

function header(w, d, family) {
  const h = w.addStack();
  h.centerAlignContent();
  const left = h.addStack();
  left.layoutVertically();
  text(left, "Brida", family === "small" ? 18 : 22, GOLD, "serif");
  text(left, "Hoje · " + d.weekday + " " + d.date, 11, MUTED);
  h.addSpacer();
  const badge = h.addStack();
  badge.layoutVertically();
  const n = text(badge, d.total, family === "small" ? 26 : 30, GOLD, "bold");
  n.rightAlignText();
  const l = text(badge, d.total === 1 ? "cliente" : "clientes", 10, MUTED);
  l.rightAlignText();
}

function row(w, p) {
  const line = w.addStack();
  line.size = new Size(0, 1);
  line.backgroundColor = LINE;
  w.addSpacer(7);
  const r = w.addStack();
  r.centerAlignContent();
  const left = r.addStack();
  left.layoutVertically();
  text(left, p.name, 15, WHITE, "bold");
  let when = p.count === 0 ? "Sem marcações" : "1.ª " + p.first + (p.next && p.next !== p.first ? "  ·  próx. " + p.next : p.next ? "" : "  ·  sem mais hoje");
  text(left, when, 11, MUTED);
  r.addSpacer();
  const right = r.addStack();
  right.layoutVertically();
  const c = text(right, p.count, 20, p.count ? GOLD : MUTED, "bold");
  c.rightAlignText();
  const s = text(right, p.pending ? p.pending + " por confirmar" : p.count === 1 ? "cliente" : "clientes", 9, p.pending ? GOLD_DARK : MUTED);
  s.rightAlignText();
  w.addSpacer(7);
}

function build(d, family, offline) {
  const w = base();
  w.setPadding(14, 16, 12, 16);
  header(w, d, family);
  if (family === "small") {
    w.addSpacer();
    const firsts = d.staff.map((p) => p.next).filter(Boolean).sort();
    text(w, firsts.length ? "Próxima " + firsts[0] : "Sem mais hoje", 12, WHITE, "bold");
    text(w, d.staff.length + (d.staff.length === 1 ? " profissional" : " profissionais"), 10, MUTED);
  } else {
    w.addSpacer(10);
    const max = family === "large" || family === "extraLarge" ? 8 : 3;
    d.staff.slice(0, max).forEach((p) => row(w, p));
    if (d.staff.length > max) text(w, "+ " + (d.staff.length - max) + " no painel", 10, MUTED);
    w.addSpacer();
  }
  const f = new DateFormatter();
  f.dateFormat = "HH:mm";
  const foot = text(w, (offline ? "Sem ligação · " : "Atualizado ") + f.string(new Date(d.updatedAt)), 9, MUTED);
  foot.rightAlignText();
  return w;
}

function failure(msg) {
  const w = base();
  w.setPadding(14, 16, 14, 16);
  text(w, "Brida", 20, GOLD, "serif");
  w.addSpacer(6);
  const t = w.addText(msg);
  t.font = Font.systemFont(12);
  t.textColor = MUTED;
  return w;
}

const family = config.widgetFamily || "large";
let widget;
try {
  widget = build(await load(), family, false);
} catch (e) {
  const c = cached();
  widget = c ? build(c, family, true) : failure("Não consegui carregar a agenda: " + e.message);
}
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
`;
}
