import "server-only";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Acesso ao PostgreSQL pelo servidor.
 *
 * - Com DATABASE_URL (a ligação Postgres do Supabase: Project Settings → Database)
 *   usa o driver `pg`. A ligação é a do dono da base, por isso ignora RLS — este
 *   ficheiro é server-only e nunca chega ao browser.
 * - Sem DATABASE_URL usa o PGlite (Postgres em WebAssembly) gravado em .data/pg.
 *   Na primeira execução aplica supabase/local-shim.sql + schema.sql + seed.sql,
 *   para tudo funcionar em desenvolvimento sem instalar nada.
 *
 * Os tipos voltam normalizados nos dois casos: date → "YYYY-MM-DD",
 * timestamptz → ISO 8601, numeric/bigint → number.
 */

type Row = Record<string, unknown>;
interface Executor {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIMESTAMP: 1114, TIMESTAMPTZ: 1184 };
// "2026-10-02 08:00:00+00" / "…-03" / "…+05:30": só assume UTC se não vier nenhum fuso
const toIso = (v: string) => new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/.test(v) ? v : `${v}Z`).toISOString();

export const usingLocalDb = () => !process.env.DATABASE_URL;

async function createExecutor(): Promise<Executor> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const pg = await import("pg");
    const { Pool, types } = pg.default ?? pg;
    types.setTypeParser(OID.DATE, (v: string) => v);
    types.setTypeParser(OID.TIMESTAMPTZ, (v: string) => new Date(v).toISOString());
    types.setTypeParser(OID.NUMERIC, (v: string) => Number(v));
    types.setTypeParser(OID.INT8, (v: string) => Number(v));

    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new Pool({
      connectionString: url,
      // Supabase exige TLS; a cadeia de certificados varia, o túnel já é cifrado.
      ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: false },
      max: Number(process.env.DATABASE_POOL_MAX ?? 4),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    return {
      async query<T = Row>(sql: string, params: unknown[] = []) {
        const r = await pool.query(sql, params);
        return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pg");
  await mkdir(path.dirname(dataDir), { recursive: true });
  const db = await PGlite.create({
    dataDir,
    extensions: { btree_gist, pg_trgm },
    parsers: {
      [OID.DATE]: (v: string) => v,
      [OID.TIMESTAMPTZ]: (v: string) => toIso(v),
      [OID.NUMERIC]: (v: string) => Number(v),
      [OID.INT8]: (v: string) => Number(v),
    },
  });

  // sessão em UTC, como no Supabase (o PGlite herdava o fuso do computador)
  await db.exec(`set timezone to 'UTC'`);

  const ready = await db.query<{ ok: boolean }>(`select to_regclass('public.salon_settings') is not null as ok`);
  if (!ready.rows[0]?.ok) {
    const dir = path.join(process.cwd(), "supabase");
    for (const file of ["local-shim.sql", "schema.sql", "seed.sql"]) {
      await db.exec(await readFile(path.join(dir, file), "utf8"));
    }
    console.log("[db] base local criada em .data/pg (schema + seed)");
  }

  return {
    async query<T = Row>(sql: string, params: unknown[] = []) {
      const r = await db.query<T>(sql, params as never[]);
      // em UPDATE/DELETE o PGlite devolve a contagem em affectedRows
      return { rows: r.rows ?? [], rowCount: r.affectedRows ?? r.rows?.length ?? 0 };
    },
  };
}

// Um só executor por processo (sobrevive ao hot-reload do Next).
const g = globalThis as unknown as { __bridaDb?: Promise<Executor> };
function executor() {
  g.__bridaDb ??= createExecutor().catch((e) => {
    g.__bridaDb = undefined;
    throw e;
  });
  return g.__bridaDb;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (await executor()).query<T>(sql, params)).rows;
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(sql, params))[0] ?? null;
}

export async function exec(sql: string, params: unknown[] = []): Promise<number> {
  return (await (await executor()).query(sql, params)).rowCount;
}

/** Códigos de erro das funções SQL (SLOT_UNAVAILABLE, …) vêm na mensagem. */
export function dbErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
