// Aplica um ficheiro SQL à base apontada por DATABASE_URL, dentro de uma
// transação: se alguma linha falhar, não fica nada aplicado pela metade.
//
// Uso:  node supabase/aplicar-migracao.mjs supabase/migrations-007-convites.sql
import { readFile } from "node:fs/promises";
import pg from "pg";

const ficheiro = process.argv[2];
if (!ficheiro) {
  console.error("Falta o ficheiro .sql");
  process.exit(1);
}

// .env.local não é carregado fora do Next
const env = await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => "");
// split por /\r?\n/ e não por "\n": o .env.local tem fins de linha do Windows,
// e em JavaScript o "." de (.*) não casa com \r — a regex falhava em silêncio
// e dava "DATABASE_URL em falta" com a variável mesmo ali.
for (const linha of env.split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL em falta");
  process.exit(1);
}

const sql = await readFile(ficheiro, "utf8");
// Uma ligação direta e não o pooler em modo transação: aqui queremos mesmo
// um BEGIN/COMMIT a sério à volta de tudo.
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`✓ ${ficheiro} aplicado`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ falhou, nada foi aplicado:\n${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
