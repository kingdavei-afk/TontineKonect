import {
  db,
  newId,
  type AuditLogRow,
  type ContributionRow,
  type CycleRow,
  type MembershipRow,
  type RefundRow,
  type TontineRow,
} from "./db";
import { formatFcfa, formatDate } from "./constants";

// Formats partagés avec les composants client.
export { formatFcfa, formatDate };

export const FREQUENCIES: Record<TontineRow["frequency"], { label: string; days: number | null }> = {
  hebdo: { label: "Hebdomadaire", days: 7 },
  bimensuel: { label: "Tous les 15 jours", days: 15 },
  mensuel: { label: "Mensuelle", days: null },
};

export function frequencyLabel(f: string): string {
  return FREQUENCIES[f as TontineRow["frequency"]]?.label ?? f;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addInterval(dateISO: string, freq: TontineRow["frequency"], n: number): string {
  const d = new Date(`${dateISO.slice(0, 10)}T00:00:00Z`);
  if (freq === "mensuel") d.setUTCMonth(d.getUTCMonth() + n);
  else if (freq === "bimensuel") d.setUTCDate(d.getUTCDate() + 15 * n);
  else d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

/* ---------- Lecture ---------- */

export function getTontine(id: string): TontineRow | undefined {
  return db.prepare("SELECT * FROM tontines WHERE id = ?").get(id) as TontineRow | undefined;
}

export function getTontineByCode(code: string): TontineRow | undefined {
  return db
    .prepare("SELECT * FROM tontines WHERE invite_code = ?")
    .get(code.trim().toUpperCase()) as TontineRow | undefined;
}

export function getMembers(tontineId: string): MembershipRow[] {
  return db
    .prepare("SELECT * FROM memberships WHERE tontine_id = ? ORDER BY position ASC")
    .all(tontineId) as MembershipRow[];
}

/** Membres qui cotisent encore (les partis sont exclus). */
export function getActiveMembers(tontineId: string): MembershipRow[] {
  return getMembers(tontineId).filter((m) => m.status !== "parti");
}

export type RefundWithMember = RefundRow & {
  member: MembershipRow;
  paid_by_name: string | null;
};

export function getRefunds(tontineId: string): RefundWithMember[] {
  const refunds = db
    .prepare(
      `SELECT r.*, u.name AS paid_by_name
       FROM refunds r LEFT JOIN users u ON u.id = r.paid_by
       WHERE r.tontine_id = ? ORDER BY r.created_at DESC`
    )
    .all(tontineId) as (RefundRow & { paid_by_name: string | null })[];
  const members = new Map(getMembers(tontineId).map((m) => [m.id, m]));
  return refunds.flatMap((r) => {
    const member = members.get(r.membership_id);
    return member ? [{ ...r, member }] : [];
  });
}

export function getCycles(tontineId: string): CycleRow[] {
  return db
    .prepare("SELECT * FROM cycles WHERE tontine_id = ? ORDER BY idx ASC")
    .all(tontineId) as CycleRow[];
}

export function getCycleContributions(cycleId: string): ContributionRow[] {
  return db
    .prepare("SELECT * FROM contributions WHERE cycle_id = ?")
    .all(cycleId) as ContributionRow[];
}

export type ContributionFull = {
  membership_id: string;
  idx: number;
  due_date: string;
  beneficiary: string | null;
  member: string;
  phone: string;
  amount: number;
  method: string;
  paid_at: string;
  paid_by_name: string | null;
  payout_done: number;
  received_at: string | null;
};

/** Toutes les cotisations de la tontine, tous tours confondus (export CSV). */
export function getAllContributions(tontineId: string): ContributionFull[] {
  return db
    .prepare(
      `SELECT c.membership_id, cy.idx, cy.due_date, cy.payout_done, cy.received_at,
              b.name AS beneficiary, m.name AS member, m.phone,
              c.amount, c.method, c.paid_at, u.name AS paid_by_name
       FROM contributions c
       JOIN cycles cy ON cy.id = c.cycle_id
       JOIN memberships m ON m.id = c.membership_id
       LEFT JOIN memberships b ON b.id = cy.beneficiary_id
       LEFT JOIN users u ON u.id = c.paid_by
       WHERE cy.tontine_id = ?
       ORDER BY cy.idx, m.position`
    )
    .all(tontineId) as ContributionFull[];
}

export type MemberStat = {
  position: number;
  name: string;
  phone: string;
  status: string;
  is_treasurer: number;
  joined_at: string;
  left_at: string | null;
  paid_n: number;
  paid_total: number;
};

/** Membres de la tontine + cotisations déjà versées (export CSV). */
export function getMemberStats(tontineId: string): MemberStat[] {
  return db
    .prepare(
      `SELECT m.position, m.name, m.phone, m.status, m.is_treasurer,
              m.joined_at, m.left_at,
              (SELECT COUNT(*) FROM contributions c JOIN cycles cy ON cy.id = c.cycle_id
               WHERE c.membership_id = m.id AND cy.tontine_id = m.tontine_id) AS paid_n,
              (SELECT COALESCE(SUM(c.amount), 0) FROM contributions c
               JOIN cycles cy ON cy.id = c.cycle_id
               WHERE c.membership_id = m.id AND cy.tontine_id = m.tontine_id) AS paid_total
       FROM memberships m
       WHERE m.tontine_id = ?
       ORDER BY m.position`
    )
    .all(tontineId) as MemberStat[];
}

export type UserContribution = {
  tontine_id: string;
  tontine_name: string;
  idx: number;
  amount: number;
  method: string;
  paid_at: string;
};

/** Cotisations d'un utilisateur dans toutes ses tontines (espace membre). */
export function getUserContributions(userId: string, limit = 100): UserContribution[] {
  return db
    .prepare(
      `SELECT t.id AS tontine_id, t.name AS tontine_name, cy.idx,
              c.amount, c.method, c.paid_at
       FROM contributions c
       JOIN cycles cy ON cy.id = c.cycle_id
       JOIN tontines t ON t.id = cy.tontine_id
       JOIN memberships m ON m.id = c.membership_id
       WHERE m.user_id = ?
       ORDER BY c.paid_at DESC, c.rowid DESC
       LIMIT ?`
    )
    .all(userId, limit) as UserContribution[];
}

/* ---------- Écriture : cycles ---------- */

/** Génère les tours manquants (1 tour = 1 bénéficiaire, parmi les membres actifs). */
export function ensureCycles(t: TontineRow): CycleRow[] {
  const active = getActiveMembers(t.id);
  const existing = getCycles(t.id);
  const insert = db.prepare(
    `INSERT INTO cycles (id, tontine_id, idx, due_date, beneficiary_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (let idx = existing.length + 1; idx <= active.length; idx++) {
    insert.run(
      newId(),
      t.id,
      idx,
      addInterval(t.start_date, t.frequency, idx - 1),
      active[idx - 1].id,
      t.amount
    );
  }
  return getCycles(t.id);
}

/**
 * Tour en cours = premier tour dont le pot n'est ni versé, ni confirmé reçu
 * par le bénéficiaire : le tour suivant ne s'ouvre qu'après la confirmation.
 */
export function currentCycle(cycles: CycleRow[]): CycleRow | null {
  return cycles.find((c) => !c.payout_done || !c.received_at) ?? null;
}

/** Montant figé d'un tour (peut différer de la cotisation actuelle). */
export function cycleAmount(cycle: CycleRow, t: TontineRow): number {
  return cycle.amount ?? t.amount;
}

/** Déjà payé dans ce tour. */
export function paidIdsOf(cycleId: string): Set<string> {
  return new Set(
    (
      db
        .prepare("SELECT membership_id FROM contributions WHERE cycle_id = ?")
        .all(cycleId) as { membership_id: string }[]
    ).map((r) => r.membership_id)
  );
}

/**
 * Ceux qui doivent cotiser dans un tour : les membres actifs, plus ceux qui ont
 * déjà payé (y compris s'ils partent en cours de route).
 */
export function expectedPayers(
  members: MembershipRow[],
  paidIds: Set<string>
): MembershipRow[] {
  return members.filter((m) => m.status !== "parti" || paidIds.has(m.id));
}

export function pot(t: TontineRow, memberCount: number): number {
  return t.amount * memberCount;
}

export function isLate(cycle: CycleRow): boolean {
  return !cycle.payout_done && cycle.due_date < todayISO();
}

/* ---------- Écriture : journal d'audit ---------- */

export type AuditEntry = {
  tontineId: string;
  actorUserId: string | null;
  action: AuditAction;
  target?: string | null;
  amount?: number | null;
  method?: string | null;
  note?: string | null;
};

export type AuditAction =
  | "cotisation_validee"
  | "cotisation_annulee"
  | "pot_verse"
  | "pot_recu"
  | "remboursement_regle"
  | "remboursement_annule"
  | "membre_parti"
  | "membre_ajoute"
  | "montant_change"
  | "tontine_cloturee";

export const AUDIT_LABELS: Record<AuditAction, string> = {
  cotisation_validee: "Cotisation validée",
  cotisation_annulee: "Cotisation annulée",
  pot_verse: "Pot versé",
  pot_recu: "Réception du pot confirmée",
  remboursement_regle: "Remboursement réglé",
  remboursement_annule: "Règlement de remboursement annulé",
  membre_parti: "Départ d'un membre",
  membre_ajoute: "Membre ajouté",
  montant_change: "Cotisation modifiée",
  tontine_cloturee: "Tontine clôturée",
};

/** Trace qui a validé quoi, quand et avec quel mode de paiement. */
export function logAudit(entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_logs (id, tontine_id, actor_user_id, action, target, amount, method, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId(),
    entry.tontineId,
    entry.actorUserId,
    entry.action,
    entry.target ?? null,
    entry.amount ?? null,
    entry.method ?? null,
    entry.note ?? null
  );
}

export type AuditLogWithActor = AuditLogRow & {
  actor_name: string | null;
  actor_phone: string | null;
};

export function getAuditLogs(tontineId: string, limit = 50): AuditLogWithActor[] {
  return db
    .prepare(
      `SELECT a.*, u.name AS actor_name, u.phone AS actor_phone
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.tontine_id = ?
       ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`
    )
    .all(tontineId, limit) as AuditLogWithActor[];
}

/** Nom du bénéficiaire d'un tour (pour le journal d'audit). */
function beneficiaryLabel(cycleId: string): string | null {
  const row = db
    .prepare(
      `SELECT m.name FROM cycles c LEFT JOIN memberships m ON m.id = c.beneficiary_id
       WHERE c.id = ?`
    )
    .get(cycleId) as { name: string | null } | undefined;
  return row?.name ?? null;
}

function cycleTontineId(cycleId: string): string {
  const row = db.prepare("SELECT tontine_id FROM cycles WHERE id = ?").get(cycleId) as
    | { tontine_id: string }
    | undefined;
  return row?.tontine_id ?? "";
}

function cycleIdx(cycleId: string): number | string {
  const row = db.prepare("SELECT idx FROM cycles WHERE id = ?").get(cycleId) as
    | { idx: number }
    | undefined;
  return row?.idx ?? "?";
}

function cyclePotAmount(cycleId: string): number | null {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM contributions WHERE cycle_id = ?")
    .get(cycleId) as { total: number } | undefined;
  if (row && row.total > 0) return row.total;
  const cyc = db.prepare("SELECT amount FROM cycles WHERE id = ?").get(cycleId) as
    | { amount: number | null }
    | undefined;
  return cyc?.amount ?? null;
}

function memberLabel(membershipId: string): string | null {
  const row = db.prepare("SELECT name FROM memberships WHERE id = ?").get(membershipId) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}

/* ---------- Écriture : membres ---------- */

export function addMember(input: {
  tontineId: string;
  phone: string;
  name: string;
  userId?: string | null;
  treasurer?: boolean;
  actorUserId?: string | null;
}): MembershipRow {
  const already = db
    .prepare("SELECT * FROM memberships WHERE tontine_id = ? AND phone = ?")
    .get(input.tontineId, input.phone) as MembershipRow | undefined;
  if (already) {
    if (input.userId && !already.user_id) {
      db.prepare("UPDATE memberships SET user_id = ?, name = ? WHERE id = ?").run(
        input.userId,
        input.name,
        already.id
      );
      return db.prepare("SELECT * FROM memberships WHERE id = ?").get(already.id) as MembershipRow;
    }
    return already;
  }
  const pos = db
    .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM memberships WHERE tontine_id = ?")
    .get(input.tontineId) as { p: number };
  const id = newId();
  db.prepare(
    `INSERT INTO memberships (id, tontine_id, user_id, phone, name, position, is_treasurer)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.tontineId, input.userId ?? null, input.phone, input.name, pos.p, input.treasurer ? 1 : 0);
  logAudit({
    tontineId: input.tontineId,
    actorUserId: input.actorUserId ?? null,
    action: "membre_ajoute",
    target: input.name,
    note: input.treasurer ? "Trésorier (créateur)" : null,
  });
  return db.prepare("SELECT * FROM memberships WHERE id = ?").get(id) as MembershipRow;
}

/** Relie les inscriptions en attente (téléphone renseigné avant le compte). */
export function linkPendingMemberships(userId: string, phone: string, name: string): void {
  db.prepare(
    `UPDATE memberships SET user_id = ?, name = ?
     WHERE phone = ? AND user_id IS NULL`
  ).run(userId, name, phone);
}

/* ---------- Écriture : cotisations ---------- */

export function markContribution(input: {
  cycleId: string;
  membershipId: string;
  amount: number;
  method: string;
  paidBy: string;
  note?: string;
}): void {
  db.prepare(
    `INSERT INTO contributions (id, cycle_id, membership_id, amount, method, note, paid_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cycle_id, membership_id)
     DO UPDATE SET amount = excluded.amount, method = excluded.method,
                   note = excluded.note, paid_at = datetime('now'), paid_by = excluded.paid_by`
  ).run(newId(), input.cycleId, input.membershipId, input.amount, input.method, input.note ?? null, input.paidBy);
  logAudit({
    tontineId: cycleTontineId(input.cycleId),
    actorUserId: input.paidBy,
    action: "cotisation_validee",
    target: memberLabel(input.membershipId),
    amount: input.amount,
    method: input.method,
    note: `Tour n°${cycleIdx(input.cycleId)}`,
  });
}

export function unmarkContribution(
  cycleId: string,
  membershipId: string,
  actorUserId: string
): void {
  const prev = db
    .prepare("SELECT amount, method FROM contributions WHERE cycle_id = ? AND membership_id = ?")
    .get(cycleId, membershipId) as { amount: number; method: string } | undefined;
  db.prepare("DELETE FROM contributions WHERE cycle_id = ? AND membership_id = ?").run(
    cycleId,
    membershipId
  );
  logAudit({
    tontineId: cycleTontineId(cycleId),
    actorUserId,
    action: "cotisation_annulee",
    target: memberLabel(membershipId),
    amount: prev?.amount ?? null,
    method: prev?.method ?? null,
    note: `Tour n°${cycleIdx(cycleId)}`,
  });
}

export function markPayout(
  cycleId: string,
  done: boolean,
  actorUserId: string
): void {
  db.prepare(
    "UPDATE cycles SET payout_done = ?, payout_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, received_at = CASE WHEN ? = 1 THEN received_at ELSE NULL END, received_by = CASE WHEN ? = 1 THEN received_by ELSE NULL END WHERE id = ?"
  ).run(done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, cycleId);
  const beneficiary = beneficiaryLabel(cycleId);
  logAudit({
    tontineId: cycleTontineId(cycleId),
    actorUserId,
    action: "pot_verse",
    target: beneficiary,
    amount: cyclePotAmount(cycleId),
    method: null,
    note: done ? `Tour n°${cycleIdx(cycleId)}` : `Tour n°${cycleIdx(cycleId)} — annulation`,
  });
}

/** Le bénéficiaire confirme avoir bien reçu le pot : le tour suivant s'ouvre. */
export function confirmCycleReceipt(input: {
  cycleId: string;
  actorUserId: string;
  actorMembershipId: string;
  byTreasurer?: boolean;
}): ActionResult {
  const c = db.prepare("SELECT * FROM cycles WHERE id = ?").get(input.cycleId) as
    | CycleRow
    | undefined;
  if (!c) return fail("Tour introuvable.");
  if (!c.payout_done) return fail("Le pot n'a pas encore été versé.");
  if (c.received_at) return fail("La réception du pot est déjà confirmée.");

  db.prepare("UPDATE cycles SET received_at = datetime('now'), received_by = ? WHERE id = ?").run(
    input.actorMembershipId,
    c.id
  );
  logAudit({
    tontineId: c.tontine_id,
    actorUserId: input.actorUserId,
    action: "pot_recu",
    target: beneficiaryLabel(c.id),
    amount: cyclePotAmount(c.id),
    note:
      `Tour n°${c.idx}` + (input.byTreasurer ? " — confirmé par le trésorier (membre sans compte)" : ""),
  });
  return {
    ok: true,
    message: input.byTreasurer
      ? "Réception confirmée en son nom : le tour suivant est ouvert."
      : "Réception confirmée : le tour suivant est ouvert.",
  };
}

export { METHODS } from "./constants";

/* ---------- Écriture : sortie d'argent (départs, remboursements, clôture) ---------- */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Capital déjà versé par un membre (toutes cotisations confondues). */
export function memberCapital(tontineId: string, membershipId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(c.amount), 0) AS total
       FROM contributions c JOIN cycles cy ON cy.id = c.cycle_id
       WHERE c.membership_id = ? AND cy.tontine_id = ?`
    )
    .get(membershipId, tontineId) as { total: number };
  return row.total;
}

export function getAmountChanges(tontineId: string): {
  old_amount: number;
  new_amount: number;
  from_cycle: number;
  created_at: string;
}[] {
  return db
    .prepare(
      "SELECT old_amount, new_amount, from_cycle, created_at FROM amount_changes WHERE tontine_id = ? ORDER BY created_at DESC"
    )
    .all(tontineId) as {
    old_amount: number;
    new_amount: number;
    from_cycle: number;
    created_at: string;
  }[];
}

/** Réaffecte les tours à venir aux membres actifs et supprime les tours de trop. */
function reassignFutureCycles(t: TontineRow): void {
  const active = getActiveMembers(t.id);
  const cycles = getCycles(t.id);
  const cur = currentCycle(cycles);
  const fromIdx = cur ? cur.idx + 1 : 1;

  db.prepare(
    `DELETE FROM cycles WHERE tontine_id = ? AND idx > ? AND payout_done = 0
       AND NOT EXISTS (SELECT 1 FROM contributions c WHERE c.cycle_id = cycles.id)`
  ).run(t.id, active.length);

  const update = db.prepare(
    "UPDATE cycles SET beneficiary_id = ? WHERE tontine_id = ? AND idx = ?"
  );
  for (const c of cycles) {
    if (c.idx >= fromIdx && c.idx <= active.length && !c.payout_done) {
      const beneficiary = active[c.idx - 1];
      if (beneficiary) update.run(beneficiary.id, t.id, c.idx);
    }
  }
}

/** Un membre quitte la tontine : on le marque « parti », on ouvre son remboursement et on réaffecte les tours. */
export function leaveMember(
  tontineId: string,
  membershipId: string,
  actorUserId: string
): ActionResult {
  const t = getTontine(tontineId);
  if (!t) return fail("Tontine introuvable.");
  if (t.status !== "actif") return fail("Tontine clôturée : plus de départ possible.");

  const m = db
    .prepare("SELECT * FROM memberships WHERE id = ? AND tontine_id = ?")
    .get(membershipId, tontineId) as MembershipRow | undefined;
  if (!m) return fail("Membre introuvable.");
  if (m.status !== "parti" && m.status !== "actif") return fail("Membre introuvable.");
  if (m.status !== "actif") return fail("Ce membre a déjà quitté la tontine.");
  if (m.is_treasurer)
    return fail("Le trésorier ne peut pas quitter la tontine : transmettez d'abord ce rôle.");

  const cycles = ensureCycles(t);
  const cur = currentCycle(cycles);
  if (cur && cur.beneficiary_id === m.id)
    return fail("Ce membre est le bénéficiaire du tour en cours : attendez la fin du tour.");

  const received = db
    .prepare(
      "SELECT 1 AS x FROM cycles WHERE tontine_id = ? AND beneficiary_id = ? AND payout_done = 1"
    )
    .get(tontineId, m.id);
  if (received)
    return fail("Ce membre a déjà reçu le pot : son départ laisserait la caisse en déficit.");

  const capital = memberCapital(tontineId, m.id);

  db.transaction(() => {
    db.prepare(
      "UPDATE memberships SET status = 'parti', left_at = datetime('now') WHERE id = ?"
    ).run(m.id);
    if (capital > 0) {
      db.prepare(
        `INSERT INTO refunds (id, tontine_id, membership_id, amount)
         VALUES (?, ?, ?, ?) ON CONFLICT(tontine_id, membership_id) DO NOTHING`
      ).run(newId(), tontineId, m.id, capital);
    }
    reassignFutureCycles(t);
    logAudit({
      tontineId,
      actorUserId,
      action: "membre_parti",
      target: m.name,
      amount: capital > 0 ? capital : null,
      note: capital > 0 ? "Remboursement à régler" : "Aucune cotisation versée",
    });
  })();

  return {
    ok: true,
    message:
      capital > 0
        ? `${m.name} est parti(e) : remboursement de ${formatFcfa(capital)} à régler.`
        : `${m.name} est parti(e) sans remboursement (aucune cotisation versée).`,
  };
}

/** La cotisation change à partir du tour suivant (le tour en cours garde son montant). */
export function changeAmount(
  tontineId: string,
  newAmount: number,
  userId: string
): ActionResult {
  const t = getTontine(tontineId);
  if (!t) return fail("Tontine introuvable.");
  if (t.status !== "actif") return fail("Tontine clôturée : montant figé.");
  if (!Number.isFinite(newAmount) || newAmount < 500)
    return fail("La cotisation minimum est de 500 F.");
  const rounded = Math.round(newAmount);
  if (rounded === t.amount) return fail(`Le montant est déjà à ${formatFcfa(rounded)}.`);

  const cycles = ensureCycles(t);
  const cur = currentCycle(cycles);
  const fromIdx = cur ? cur.idx + 1 : 1;
  const old = t.amount;

  db.transaction(() => {
    db.prepare("UPDATE tontines SET amount = ? WHERE id = ?").run(rounded, tontineId);
    db.prepare("UPDATE cycles SET amount = ? WHERE tontine_id = ? AND idx >= ?").run(
      rounded,
      tontineId,
      fromIdx
    );
    db.prepare(
      `INSERT INTO amount_changes (id, tontine_id, old_amount, new_amount, from_cycle, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(newId(), tontineId, old, rounded, fromIdx, userId);
    logAudit({
      tontineId,
      actorUserId: userId,
      action: "montant_change",
      target: `${formatFcfa(old)} → ${formatFcfa(rounded)}`,
      amount: rounded,
      note: `À partir du tour n°${fromIdx}`,
    });
  })();

  return {
    ok: true,
    message: `Cotisation portée de ${formatFcfa(old)} à ${formatFcfa(rounded)} à partir du tour n°${fromIdx}.`,
  };
}

/** Clôture définitive de la tontine (les tours restants sont annulés). */
export function closeTontine(tontineId: string, actorUserId: string): ActionResult {
  const t = getTontine(tontineId);
  if (!t) return fail("Tontine introuvable.");
  if (t.status !== "actif") return fail("Cette tontine est déjà clôturée.");
  db.prepare("UPDATE tontines SET status = 'cloturee', closed_at = datetime('now') WHERE id = ?").run(
    tontineId
  );
  logAudit({
    tontineId,
    actorUserId,
    action: "tontine_cloturee",
    target: t.name,
    note: "Clôture définitive — lecture seule",
  });
  return { ok: true, message: "Tontine clôturée : elle reste consultable en lecture seule." };
}

/** Enregistre le remboursement effectué d'un membre parti. */
export function markRefundPaid(input: {
  refundId: string;
  tontineId: string;
  amount: number;
  method: string;
  note?: string;
  paidBy: string;
}): ActionResult {
  const r = db
    .prepare("SELECT * FROM refunds WHERE id = ? AND tontine_id = ?")
    .get(input.refundId, input.tontineId) as RefundRow | undefined;
  if (!r) return fail("Remboursement introuvable.");
  if (r.status === "paye") return fail("Ce remboursement est déjà réglé.");
  if (!Number.isFinite(input.amount) || input.amount < 0)
    return fail("Montant invalide.");

  db.prepare(
    `UPDATE refunds SET status = 'paye', paid_amount = ?, method = ?, note = ?,
       paid_at = datetime('now'), paid_by = ? WHERE id = ?`
  ).run(
    Math.round(input.amount),
    input.method,
    input.note?.trim() || null,
    input.paidBy,
    input.refundId
  );
  const member = db
    .prepare("SELECT name FROM memberships WHERE id = ?")
    .get(r.membership_id) as { name: string } | undefined;
  logAudit({
    tontineId: input.tontineId,
    actorUserId: input.paidBy,
    action: "remboursement_regle",
    target: member?.name ?? null,
    amount: Math.round(input.amount),
    method: input.method,
    note: input.note?.trim() || null,
  });
  return { ok: true };
}

/** Annule un remboursement marqué par erreur. */
export function unmarkRefundPaid(
  refundId: string,
  tontineId: string,
  actorUserId: string
): ActionResult {
  const r = db
    .prepare("SELECT * FROM refunds WHERE id = ? AND tontine_id = ?")
    .get(refundId, tontineId) as RefundRow | undefined;
  if (!r) return fail("Remboursement introuvable.");
  if (r.status !== "paye") return fail("Ce remboursement n'est pas réglé.");
  db.prepare(
    "UPDATE refunds SET status = 'attente', paid_amount = NULL, method = NULL, paid_at = NULL, paid_by = NULL WHERE id = ?"
  ).run(refundId);
  const member = db
    .prepare("SELECT name FROM memberships WHERE id = ?")
    .get(r.membership_id) as { name: string } | undefined;
  logAudit({
    tontineId,
    actorUserId,
    action: "remboursement_annule",
    target: member?.name ?? null,
    amount: r.paid_amount,
    method: r.method,
  });
  return { ok: true };
}
