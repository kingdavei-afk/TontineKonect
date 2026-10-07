import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_treasurer INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  UNIQUE (tontine_id, idx)
);

CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  note TEXT,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  cycle_id TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('membre','tresorier')),
  stage TEXT NOT NULL CHECK (stage IN ('avant','jour','retard')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tontine_id, membership_id)
);

CREATE TABLE IF NOT EXISTS amount_changes (
  id TEXT PRIMARY KEY,
  tontine_id TEXT NOT NULL REFERENCES tontines(id) ON DELETE CASCADE,
  old_amount INTEGER NOT NULL,
  new_amount INTEGER NOT NULL,
  from_cycle INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tontine ON audit_logs(tontine_id);
`;

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

function create(): Database.Database {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "tontine.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Colonnes ajoutées après la première version du schéma. */
function migrate(db: Database.Database): void {
  const columns = (table: string) =>
    new Set((db.pragma(`table_info(${table})`) as { name: string }[]).map((r) => r.name));

  const tontines = columns("tontines");
  if (!tontines.has("closed_at")) db.exec("ALTER TABLE tontines ADD COLUMN closed_at TEXT");

  const members = columns("memberships");
  if (!members.has("status"))
    db.exec("ALTER TABLE memberships ADD COLUMN status TEXT NOT NULL DEFAULT 'actif'");
  if (!members.has("left_at")) db.exec("ALTER TABLE memberships ADD COLUMN left_at TEXT");

  const cycles = columns("cycles");
  if (!cycles.has("amount")) db.exec("ALTER TABLE cycles ADD COLUMN amount INTEGER");
  db.exec(
    `UPDATE cycles SET amount = (SELECT amount FROM tontines WHERE tontines.id = cycles.tontine_id)
     WHERE amount IS NULL`
  );
  const hadReceived = cycles.has("received_at");
  if (!hadReceived) {
    db.exec("ALTER TABLE cycles ADD COLUMN received_at TEXT");
    db.exec("ALTER TABLE cycles ADD COLUMN received_by TEXT REFERENCES memberships(id)");
    // Une seule fois : les pots déjà versés avant l'ajout de la confirmation
    // sont réputés reçus. Ne jamais rejouer cette valeur sur les cycles
    // confirmés (la fonction peut être rappelée à chaque ouverture de base).
    db.exec("UPDATE cycles SET received_at = payout_at WHERE received_at IS NULL AND payout_done = 1");
  }
}

const g = globalThis as unknown as { __tontineDb?: Database.Database };
export const db = g.__tontineDb ?? (g.__tontineDb = create());

export function newId(): string {
  return crypto.randomUUID();
}
