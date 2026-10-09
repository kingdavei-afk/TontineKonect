/**
 * Transfert one-shot : SQLite local (data/tontine.db) → Postgres (DATABASE_URL).
 *
 * Usage : node --experimental-strip-types scripts/transfer-sqlite-to-pg.ts
 * Idempotent : les clés primaires déjà présentes sont ignorées (DO NOTHING).
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { Pool, types } from "pg";

types.setTypeParser(20, (v: string) => parseInt(v, 10));
types.setTypeParser(1700, (v: string) => parseFloat(v));

// Ordre des clés étrangères.
const TABLES = [
  "users",
  "sessions",
  "tontines",
  "memberships",
  "cycles",
  "contributions",
  "push_subscriptions",
  "reminders",
  "refunds",
  "amount_changes",
  "audit_logs",
] as const;

function loadDatabaseUrl(): string {
  const envFile = path.join(process.cwd(), ".env.local");
  const line = fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL introuvable dans .env.local");
  return line
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/([?&])channel_binding=require&?/, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
}

async function main() {
  const sqlitePath = path.join(process.cwd(), "data", "tontine.db");
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite introuvable : ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });
  const pg = new Pool({ connectionString: loadDatabaseUrl() });

  let total = 0;
  try {
    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) {
        console.log(`${table.padEnd(20)} 0 ligne`);
        continue;
      }
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      let inserted = 0;
      for (const row of rows) {
        const res = await pg.query(
          sql,
          cols.map((c) => row[c])
        );
        inserted += res.rowCount ?? 0;
      }
      total += inserted;
      console.log(`${table.padEnd(20)} ${inserted}/${rows.length} ligne(s)`);
    }
    console.log(`\nTransfert terminé : ${total} ligne(s) insérée(s).`);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error("ÉCHEC :", err);
  process.exit(1);
});
