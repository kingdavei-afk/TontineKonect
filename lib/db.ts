import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types, type PoolClient } from "pg";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

// COUNT/SUM renvoient int8 (20) et numeric (1700) sous forme de chaînes par
// défaut : nos compteurs et nos montants sont bien loin de 2^53, on convertit.
types.setTypeParser(20, (v: string) => parseInt(v, 10));
types.setTypeParser(1700, (v: string) => parseFloat(v));

function createPool(): Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL manquant : renseignez-le dans .env.local (local) ou dans les variables d'environnement Vercel."
    );
  }
  // Neon ajoute channel_binding=require, que le driver pg ne supporte pas
  // (SCRAM sans channel binding) : sslmode=require chiffre déjà la connexion.
  const url = raw
    .replace(/([?&])channel_binding=require&?/, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

const g = globalThis as unknown as { __tontinePool?: Pool };
export const pool = g.__tontinePool ?? (g.__tontinePool = createPool());

/* ------------------------------------------------------------------ */
/* Schéma                                                              */
/* ------------------------------------------------------------------ */

// Postgres : les dates restent en TEXT au format « AAAA-MM-JJ HH:MM:SS » UTC
// (même format que SQLite datetime('now')) pour que les comparaisons de
// chaînes et l'affichage français continuent de fonctionner à l'identique.
const NOW = `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tontines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('hebdo','bimensuel','mensuel')),
  start_date TEXT NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'actif',
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_treasurer INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (${NOW}),
  status TEXT NOT NULL DEFAULT 'actif',
  left_at TEXT,
  UNIQUE (tontine_id, phone)
);

CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  beneficiary_id TEXT REFERENCES memberships(id),
  payout_done INTEGER NOT NULL DEFAULT 0,
  payout_at TEXT,
  received_at TEXT,
  received_by TEXT REFERENCES memberships(id),
  amount INTEGER,
  UNIQUE (tontine_id, idx)
);

CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT,
  paid_at TEXT NOT NULL DEFAULT (${NOW}),
  paid_by TEXT REFERENCES users(id),
  UNIQUE (cycle_id, membership_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tontine ON memberships(tontine_id);
CREATE INDEX IF NOT EXISTS idx_cycles_tontine ON cycles(tontine_id);
CREATE INDEX IF NOT EXISTS idx_contrib_cycle ON contributions(cycle_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  cycle_id TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('membre','tresorier')),
  stage TEXT NOT NULL CHECK (stage IN ('avant','jour','retard')),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (cycle_id, membership_id, kind, stage)
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid_amount INTEGER,
  method TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'attente' CHECK (status IN ('attente','paye')),
  paid_at TEXT,
  paid_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (tontine_id, membership_id)
);

CREATE TABLE IF NOT EXISTS amount_changes (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  old_amount INTEGER NOT NULL,
  new_amount INTEGER NOT NULL,
  from_cycle INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT,
  amount INTEGER,
  method TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);

CREATE INDEX IF NOT EXISTS idx_audit_tontine ON audit_logs(tontine_id);
`;

/** Crée les tables si elles n'existent pas (idempotent, safe à chaque démarrage). */
export async function ensureSchema(): Promise<void> {
  await pool.query(SCHEMA);
}

/* ------------------------------------------------------------------ */
/* Helpers de requête                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convertit les placeholders SQLite (`?`) en placeholders PostgreSQL (`$1`…).
 * Les `?` à l'intérieur de littéraux entre guillemets simples sont ignorés.
 */
function placeholders(sql: string): string {
  let n = 0;
  let inStr = false;
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") inStr = !inStr;
    if (ch === "?" && !inStr) out += `$${++n}`;
    else out += ch;
  }
  return out;
}

// Client courant d'une transaction en cours (toutes les requêtes émises pendant
// tx() partagent la même connexion), sinon le pool.
const txStore = new AsyncLocalStorage<PoolClient>();

async function exec(sql: string, params: unknown[]) {
  const client = txStore.getStore();
  const text = placeholders(sql);
  return client ? client.query(text, params) : pool.query(text, params);
}

/** Toutes les lignes correspondantes. */
export async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await exec(sql, params);
  return res.rows as T[];
}

/** La première ligne, ou undefined. */
export async function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const res = await exec(sql, params);
  return res.rows[0] as T | undefined;
}

/** Exécute une écriture, renvoie le nombre de lignes affectées. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
  const res = await exec(sql, params);
  return res.rowCount ?? 0;
}

/**
 * Enveloppe une série d'écritures dans une transaction (BEGIN/COMMIT, ROLLBACK
 * en cas d'erreur). Toutes les requêtes faites dans `fn` — via all/get/run —
 * partagent la même connexion.
 */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await txStore.run(client, fn);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export function newId(): string {
  return crypto.randomUUID();
}

/** Horodatage UTC « AAAA-MM-JJ HH:MM:SS », identique à SQLite datetime('now'). */
export function sqlNow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Horodatage UTC décalé de `days` jours (expiration des sessions…). */
export function sqlNowPlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
}

/* ------------------------------------------------------------------ */
/* Types (lignes de la base)                                           */
/* ------------------------------------------------------------------ */

export type UserRow = {
  id: string;
  phone: string;
  name: string;
  pin: string;
  created_at: string;
};

export type TontineRow = {
  id: string;
  name: string;
  amount: number;
  frequency: "hebdo" | "bimensuel" | "mensuel";
  start_date: string;
  creator_id: string;
  invite_code: string;
  status: string;
  closed_at: string | null;
};

export type RefundRow = {
  id: string;
  tontine_id: string;
  membership_id: string;
  amount: number;
  paid_amount: number | null;
  method: string | null;
  note: string | null;
  status: "attente" | "paye";
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
};

export type MembershipRow = {
  id: string;
  tontine_id: string;
  user_id: string | null;
  phone: string;
  name: string;
  position: number;
  is_treasurer: number;
  joined_at: string;
  status: "actif" | "parti";
  left_at: string | null;
};

export type CycleRow = {
  id: string;
  tontine_id: string;
  idx: number;
  due_date: string;
  beneficiary_id: string | null;
  payout_done: number;
  payout_at: string | null;
  received_at: string | null;
  received_by: string | null;
  amount: number | null;
};

export type AuditLogRow = {
  id: string;
  tontine_id: string;
  actor_user_id: string | null;
  action: string;
  target: string | null;
  amount: number | null;
  method: string | null;
  note: string | null;
  created_at: string;
};

export type ContributionRow = {
  id: string;
  cycle_id: string;
  membership_id: string;
  amount: number;
  method: string;
  note: string | null;
  paid_at: string;
  paid_by: string | null;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type ReminderRow = {
  id: string;
  tontine_id: string;
  cycle_id: string;
  membership_id: string;
  kind: "membre" | "tresorier";
  stage: "avant" | "jour" | "retard";
  created_at: string;
};
