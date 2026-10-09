import {
  all,
  get,
  newId,
  run,
  tx,
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

// Horodatage UTC compatible SQLite datetime('now') (voir lib/db.ts).
const NOW = `to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

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

export async function getTontine(id: string): Promise<TontineRow | undefined> {
  return get<TontineRow>("SELECT * FROM tontines WHERE id = ?", [id]);
}

export async function getTontineByCode(code: string): Promise<TontineRow | undefined> {
  return get<TontineRow>("SELECT * FROM tontines WHERE invite_code = ?", [
    code.trim().toUpperCase(),
  ]);
}

export async function getMembers(tontineId: string): Promise<MembershipRow[]> {
  return all<MembershipRow>("SELECT * FROM memberships WHERE tontine_id = ? ORDER BY position ASC", [
    tontineId,
  ]);
}

/** Membres qui cotisent encore (les partis sont exclus). */
export async function getActiveMembers(tontineId: string): Promise<MembershipRow[]> {
  return (await getMembers(tontineId)).filter((m) => m.status !== "parti");
}

export type RefundWithMember = RefundRow & {
  member: MembershipRow;
  paid_by_name: string | null;
};

export async function getRefunds(tontineId: string): Promise<RefundWithMember[]> {
  const refunds = await all<RefundRow & { paid_by_name: string | null }>(
    `SELECT r.*, u.name AS paid_by_name
     FROM refunds r LEFT JOIN users u ON u.id = r.paid_by
     WHERE r.tontine_id = ? ORDER BY r.created_at DESC`,
    [tontineId]
  );
  const members = new Map((await getMembers(tontineId)).map((m) => [m.id, m]));
  return refunds.flatMap((r) => {
    const member = members.get(r.membership_id);
    return member ? [{ ...r, member }] : [];
  });
}

export async function getCycles(tontineId: string): Promise<CycleRow[]> {
  return all<CycleRow>("SELECT * FROM cycles WHERE tontine_id = ? ORDER BY idx ASC", [tontineId]);
}

export async function getCycleContributions(cycleId: string): Promise<ContributionRow[]> {
  return all<ContributionRow>("SELECT * FROM contributions WHERE cycle_id = ?", [cycleId]);
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
export async function getAllContributions(tontineId: string): Promise<ContributionFull[]> {
  return all<ContributionFull>(
    `SELECT c.membership_id, cy.idx, cy.due_date, cy.payout_done, cy.received_at,
            b.name AS beneficiary, m.name AS member, m.phone,
            c.amount, c.method, c.paid_at, u.name AS paid_by_name
     FROM contributions c
     JOIN cycles cy ON cy.id = c.cycle_id
     JOIN memberships m ON m.id = c.membership_id
     LEFT JOIN memberships b ON b.id = cy.beneficiary_id
     LEFT JOIN users u ON u.id = c.paid_by
     WHERE cy.tontine_id = ?
     ORDER BY cy.idx, m.position`,
    [tontineId]
  );
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
export async function getMemberStats(tontineId: string): Promise<MemberStat[]> {
  return all<MemberStat>(
    `SELECT m.position, m.name, m.phone, m.status, m.is_treasurer,
            m.joined_at, m.left_at,
            (SELECT COUNT(*) FROM contributions c JOIN cycles cy ON cy.id = c.cycle_id
             WHERE c.membership_id = m.id AND cy.tontine_id = m.tontine_id) AS paid_n,
            (SELECT COALESCE(SUM(c.amount), 0) FROM contributions c
             JOIN cycles cy ON cy.id = c.cycle_id
             WHERE c.membership_id = m.id AND cy.tontine_id = m.tontine_id) AS paid_total
     FROM memberships m
     WHERE m.tontine_id = ?
     ORDER BY m.position`,
    [tontineId]
  );
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
export async function getUserContributions(
  userId: string,
  limit = 100
): Promise<UserContribution[]> {
  return all<UserContribution>(
    `SELECT t.id AS tontine_id, t.name AS tontine_name, cy.idx,
            c.amount, c.method, c.paid_at
     FROM contributions c
     JOIN cycles cy ON cy.id = c.cycle_id
     JOIN tontines t ON t.id = cy.tontine_id
     JOIN memberships m ON m.id = c.membership_id
     WHERE m.user_id = ?
     ORDER BY c.paid_at DESC, c.ctid DESC
     LIMIT ?`,
    [userId, limit]
  );
}

/* ---------- Écriture : cycles ---------- */

/** Génère les tours manquants (1 tour = 1 bénéficiaire, parmi les membres actifs). */
export async function ensureCycles(t: TontineRow): Promise<CycleRow[]> {
  const active = await getActiveMembers(t.id);
  const existing = await getCycles(t.id);
  for (let idx = existing.length + 1; idx <= active.length; idx++) {
    await run(
      `INSERT INTO cycles (id, tontine_id, idx, due_date, beneficiary_id, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), t.id, idx, addInterval(t.start_date, t.frequency, idx - 1), active[idx - 1].id, t.amount]
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
export async function paidIdsOf(cycleId: string): Promise<Set<string>> {
  const rows = await all<{ membership_id: string }>(
    "SELECT membership_id FROM contributions WHERE cycle_id = ?",
    [cycleId]
  );
  return new Set(rows.map((r) => r.membership_id));
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
export async function logAudit(entry: AuditEntry): Promise<void> {
  await run(
    `INSERT INTO audit_logs (id, tontine_id, actor_user_id, action, target, amount, method, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      entry.tontineId,
      entry.actorUserId,
      entry.action,
      entry.target ?? null,
      entry.amount ?? null,
      entry.method ?? null,
      entry.note ?? null,
    ]
  );
}

export type AuditLogWithActor = AuditLogRow & {
  actor_name: string | null;
  actor_phone: string | null;
};

export async function getAuditLogs(tontineId: string, limit = 50): Promise<AuditLogWithActor[]> {
  return all<AuditLogWithActor>(
    `SELECT a.*, u.name AS actor_name, u.phone AS actor_phone
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE a.tontine_id = ?
     ORDER BY a.created_at DESC, a.ctid DESC LIMIT ?`,
    [tontineId, limit]
  );
}

/** Nom du bénéficiaire d'un tour (pour le journal d'audit). */
async function beneficiaryLabel(cycleId: string): Promise<string | null> {
  const row = await get<{ name: string | null }>(
    `SELECT m.name FROM cycles c LEFT JOIN memberships m ON m.id = c.beneficiary_id
     WHERE c.id = ?`,
    [cycleId]
  );
  return row?.name ?? null;
}

async function cycleTontineId(cycleId: string): Promise<string> {
  const row = await get<{ tontine_id: string }>("SELECT tontine_id FROM cycles WHERE id = ?", [
    cycleId,
  ]);
  return row?.tontine_id ?? "";
}

async function cycleIdx(cycleId: string): Promise<number | string> {
  const row = await get<{ idx: number }>("SELECT idx FROM cycles WHERE id = ?", [cycleId]);
  return row?.idx ?? "?";
}

async function cyclePotAmount(cycleId: string): Promise<number | null> {
  const row = await get<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM contributions WHERE cycle_id = ?",
    [cycleId]
  );
  if (row && row.total > 0) return row.total;
  const cyc = await get<{ amount: number | null }>("SELECT amount FROM cycles WHERE id = ?", [
    cycleId,
  ]);
  return cyc?.amount ?? null;
}

async function memberLabel(membershipId: string): Promise<string | null> {
  const row = await get<{ name: string }>("SELECT name FROM memberships WHERE id = ?", [
    membershipId,
  ]);
  return row?.name ?? null;
}

/* ---------- Écriture : membres ---------- */

export async function addMember(input: {
  tontineId: string;
  phone: string;
  name: string;
  userId?: string | null;
  treasurer?: boolean;
  actorUserId?: string | null;
}): Promise<MembershipRow> {
  const already = await get<MembershipRow>(
    "SELECT * FROM memberships WHERE tontine_id = ? AND phone = ?",
    [input.tontineId, input.phone]
  );
  if (already) {
    if (input.userId && !already.user_id) {
      await run("UPDATE memberships SET user_id = ?, name = ? WHERE id = ?", [
        input.userId,
        input.name,
        already.id,
      ]);
      return (await get<MembershipRow>("SELECT * FROM memberships WHERE id = ?", [
        already.id,
      ])) as MembershipRow;
    }
    return already;
  }
  const pos = await get<{ p: number }>(
    "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM memberships WHERE tontine_id = ?",
    [input.tontineId]
  );
  const id = newId();
  await run(
    `INSERT INTO memberships (id, tontine_id, user_id, phone, name, position, is_treasurer)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.tontineId, input.userId ?? null, input.phone, input.name, pos?.p ?? 1, input.treasurer ? 1 : 0]
  );
  await logAudit({
    tontineId: input.tontineId,
    actorUserId: input.actorUserId ?? null,
    action: "membre_ajoute",
    target: input.name,
    note: input.treasurer ? "Trésorier (créateur)" : null,
  });
  return (await get<MembershipRow>("SELECT * FROM memberships WHERE id = ?", [id])) as MembershipRow;
}

/** Relie les inscriptions en attente (téléphone renseigné avant le compte). */
export async function linkPendingMemberships(
  userId: string,
  phone: string,
  name: string
): Promise<void> {
  await run(
    `UPDATE memberships SET user_id = ?, name = ?
     WHERE phone = ? AND user_id IS NULL`,
    [userId, name, phone]
  );
}

/* ---------- Écriture : cotisations ---------- */

export async function markContribution(input: {
  cycleId: string;
  membershipId: string;
  amount: number;
  method: string;
  paidBy: string;
  note?: string;
}): Promise<void> {
  await run(
    `INSERT INTO contributions (id, cycle_id, membership_id, amount, method, note, paid_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cycle_id, membership_id)
     DO UPDATE SET amount = excluded.amount, method = excluded.method,
                   note = excluded.note, paid_at = ${NOW}, paid_by = excluded.paid_by`,
    [newId(), input.cycleId, input.membershipId, input.amount, input.method, input.note ?? null, input.paidBy]
  );
  await logAudit({
    tontineId: await cycleTontineId(input.cycleId),
    actorUserId: input.paidBy,
    action: "cotisation_validee",
    target: await memberLabel(input.membershipId),
    amount: input.amount,
    method: input.method,
    note: `Tour n°${await cycleIdx(input.cycleId)}`,
  });
}

export async function unmarkContribution(
  cycleId: string,
  membershipId: string,
  actorUserId: string
): Promise<void> {
  const prev = await get<{ amount: number; method: string }>(
    "SELECT amount, method FROM contributions WHERE cycle_id = ? AND membership_id = ?",
    [cycleId, membershipId]
  );
  await run("DELETE FROM contributions WHERE cycle_id = ? AND membership_id = ?", [
    cycleId,
    membershipId,
  ]);
  await logAudit({
    tontineId: await cycleTontineId(cycleId),
    actorUserId,
    action: "cotisation_annulee",
    target: await memberLabel(membershipId),
    amount: prev?.amount ?? null,
    method: prev?.method ?? null,
    note: `Tour n°${await cycleIdx(cycleId)}`,
  });
}

export async function markPayout(
  cycleId: string,
  done: boolean,
  actorUserId: string
): Promise<void> {
  await run(
    "UPDATE cycles SET payout_done = ?, payout_at = CASE WHEN ? = 1 THEN " +
      NOW +
      " ELSE NULL END, received_at = CASE WHEN ? = 1 THEN received_at ELSE NULL END, received_by = CASE WHEN ? = 1 THEN received_by ELSE NULL END WHERE id = ?",
    [done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, done ? 1 : 0, cycleId]
  );
  const beneficiary = await beneficiaryLabel(cycleId);
  await logAudit({
    tontineId: await cycleTontineId(cycleId),
    actorUserId,
    action: "pot_verse",
    target: beneficiary,
    amount: await cyclePotAmount(cycleId),
    method: null,
    note: done ? `Tour n°${await cycleIdx(cycleId)}` : `Tour n°${await cycleIdx(cycleId)} — annulation`,
  });
}

/** Le bénéficiaire confirme avoir bien reçu le pot : le tour suivant s'ouvre. */
export async function confirmCycleReceipt(input: {
  cycleId: string;
  actorUserId: string;
  actorMembershipId: string;
  byTreasurer?: boolean;
}): Promise<ActionResult> {
  const c = await get<CycleRow>("SELECT * FROM cycles WHERE id = ?", [input.cycleId]);
  if (!c) return fail("Tour introuvable.");
  if (!c.payout_done) return fail("Le pot n'a pas encore été versé.");
  if (c.received_at) return fail("La réception du pot est déjà confirmée.");

  await run(`UPDATE cycles SET received_at = ${NOW}, received_by = ? WHERE id = ?`, [
    input.actorMembershipId,
    c.id,
  ]);
  await logAudit({
    tontineId: c.tontine_id,
    actorUserId: input.actorUserId,
    action: "pot_recu",
    target: await beneficiaryLabel(c.id),
    amount: await cyclePotAmount(c.id),
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
export async function memberCapital(
  tontineId: string,
  membershipId: string
): Promise<number> {
  const row = await get<{ total: number }>(
    `SELECT COALESCE(SUM(c.amount), 0) AS total
     FROM contributions c JOIN cycles cy ON cy.id = c.cycle_id
     WHERE c.membership_id = ? AND cy.tontine_id = ?`,
    [membershipId, tontineId]
  );
  return row?.total ?? 0;
}

export async function getAmountChanges(tontineId: string): Promise<{
  old_amount: number;
  new_amount: number;
  from_cycle: number;
  created_at: string;
}[]> {
  return all(
    "SELECT old_amount, new_amount, from_cycle, created_at FROM amount_changes WHERE tontine_id = ? ORDER BY created_at DESC",
    [tontineId]
  );
}

/** Réaffecte les tours à venir aux membres actifs et supprime les tours de trop. */
async function reassignFutureCycles(t: TontineRow): Promise<void> {
  const active = await getActiveMembers(t.id);
  const cycles = await getCycles(t.id);
  const cur = currentCycle(cycles);
  const fromIdx = cur ? cur.idx + 1 : 1;

  await run(
    `DELETE FROM cycles WHERE tontine_id = ? AND idx > ? AND payout_done = 0
       AND NOT EXISTS (SELECT 1 FROM contributions c WHERE c.cycle_id = cycles.id)`,
    [t.id, active.length]
  );

  for (const c of cycles) {
    if (c.idx >= fromIdx && c.idx <= active.length && !c.payout_done) {
      const beneficiary = active[c.idx - 1];
      if (beneficiary)
        await run("UPDATE cycles SET beneficiary_id = ? WHERE tontine_id = ? AND idx = ?", [
          beneficiary.id,
          t.id,
          c.idx,
        ]);
    }
  }
}

/** Un membre quitte la tontine : on le marque « parti », on ouvre son remboursement et on réaffecte les tours. */
export async function leaveMember(
  tontineId: string,
  membershipId: string,
  actorUserId: string
): Promise<ActionResult> {
  const t = await getTontine(tontineId);
  if (!t) return fail("Tontine introuvable.");
  if (t.status !== "actif") return fail("Tontine clôturée : plus de départ possible.");

  const m = await get<MembershipRow>("SELECT * FROM memberships WHERE id = ? AND tontine_id = ?", [
    membershipId,
    tontineId,
  ]);
  if (!m) return fail("Membre introuvable.");
  if (m.status !== "parti" && m.status !== "actif") return fail("Membre introuvable.");
  if (m.status !== "actif") return fail("Ce membre a déjà quitté la tontine.");
  if (m.is_treasurer)
    return fail("Le trésorier ne peut pas quitter la tontine : transmettez d'abord ce rôle.");

  const cycles = await ensureCycles(t);
  const cur = currentCycle(cycles);
  if (cur && cur.beneficiary_id === m.id)
    return fail("Ce membre est le bénéficiaire du tour en cours : attendez la fin du tour.");

  const received = await get<{ x: number }>(
    "SELECT 1 AS x FROM cycles WHERE tontine_id = ? AND beneficiary_id = ? AND payout_done = 1",
    [tontineId, m.id]
  );
  if (received)
    return fail("Ce membre a déjà reçu le pot : son départ laisserait la caisse en déficit.");

  const capital = await memberCapital(tontineId, m.id);

  await tx(async () => {
    await run("UPDATE memberships SET status = 'parti', left_at = " + NOW + " WHERE id = ?", [m.id]);
    if (capital > 0) {
      await run(
        `INSERT INTO refunds (id, tontine_id, membership_id, amount)
         VALUES (?, ?, ?, ?) ON CONFLICT(tontine_id, membership_id) DO NOTHING`,
        [newId(), tontineId, m.id, capital]
      );
    }
    await reassignFutureCycles(t);
    await logAudit({
      tontineId,
      actorUserId,
      action: "membre_parti",
      target: m.name,
      amount: capital > 0 ? capital : null,
      note: capital > 0 ? "Remboursement à régler" : "Aucune cotisation versée",
    });
  });

  return {
    ok: true,
    message:
      capital > 0
        ? `${m.name} est parti(e) : remboursement de ${formatFcfa(capital)} à régler.`
        : `${m.name} est parti(e) sans remboursement (aucune cotisation versée).`,
  };
}

/** La cotisation change à partir du tour suivant (le tour en cours garde son montant). */
export async function changeAmount(
  tontineId: string,
  newAmount: number,
  userId: string
): Promise<ActionResult> {
  const t = await getTontine(tontineId);
  if (!t) return fail("Tontine introuvable.");
  if (t.status !== "actif") return fail("Tontine clôturée : montant figé.");
  if (!Number.isFinite(newAmount) || newAmount < 500)
    return fail("La cotisation minimum est de 500 F.");
  const rounded = Math.round(newAmount);
  if (rounded === t.amount) return fail(`Le montant est déjà à ${formatFcfa(rounded)}.`);

  const cycles = await ensureCycles(t);
  const cur = currentCycle(cycles);
  const fromIdx = cur ? cur.idx + 1 : 1;
  const old = t.amount;

  await tx(async () => {
    await run("UPDATE tontines SET amount = ? WHERE id = ?", [rounded, tontineId]);
    await run("UPDATE cycles SET amount = ? WHERE tontine_id = ? AND idx >= ?", [
      rounded,
      tontineId,
      fromIdx,
    ]);
    await run(
      `INSERT INTO amount_changes (id, tontine_id, old_amount, new_amount, from_cycle, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), tontineId, old, rounded, fromIdx, userId]
    );
    await logAudit({
      tontineId,
      actorUserId: userId,
      action: "montant_change",
      target: `${formatFcfa(old)} → ${formatFcfa(rounded)}`,
      amount: rounded,
      note: `À partir du tour n°${fromIdx}`,
    });
  });

  return {
    ok: true,
    message: `Cotisation portée de ${formatFcfa(old)} à ${formatFcfa(rounded)} à partir du tour n°${fromIdx}.`,
  };
}

/** Clôture définitive de la tontine (les tours restants sont annulés). */
export async function closeTontine(
  tontineId: string,
  actorUserId: string
): Promise<ActionResult> {
  const t = await getTontine(tontineId);
  if (!t) return fail("Tontine introuvable.");
  if (t.status !== "actif") return fail("Cette tontine est déjà clôturée.");
  await run(`UPDATE tontines SET status = 'cloturee', closed_at = ${NOW} WHERE id = ?`, [
    tontineId,
  ]);
  await logAudit({
    tontineId,
    actorUserId,
    action: "tontine_cloturee",
    target: t.name,
    note: "Clôture définitive — lecture seule",
  });
  return { ok: true, message: "Tontine clôturée : elle reste consultable en lecture seule." };
}

/** Enregistre le remboursement effectué d'un membre parti. */
export async function markRefundPaid(input: {
  refundId: string;
  tontineId: string;
  amount: number;
  method: string;
  note?: string;
  paidBy: string;
}): Promise<ActionResult> {
  const r = await get<RefundRow>("SELECT * FROM refunds WHERE id = ? AND tontine_id = ?", [
    input.refundId,
    input.tontineId,
  ]);
  if (!r) return fail("Remboursement introuvable.");
  if (r.status === "paye") return fail("Ce remboursement est déjà réglé.");
  if (!Number.isFinite(input.amount) || input.amount < 0) return fail("Montant invalide.");

  await run(
    `UPDATE refunds SET status = 'paye', paid_amount = ?, method = ?, note = ?,
       paid_at = ${NOW}, paid_by = ? WHERE id = ?`,
    [Math.round(input.amount), input.method, input.note?.trim() || null, input.paidBy, input.refundId]
  );
  const member = await get<{ name: string }>("SELECT name FROM memberships WHERE id = ?", [
    r.membership_id,
  ]);
  await logAudit({
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
export async function unmarkRefundPaid(
  refundId: string,
  tontineId: string,
  actorUserId: string
): Promise<ActionResult> {
  const r = await get<RefundRow>("SELECT * FROM refunds WHERE id = ? AND tontine_id = ?", [
    refundId,
    tontineId,
  ]);
  if (!r) return fail("Remboursement introuvable.");
  if (r.status !== "paye") return fail("Ce remboursement n'est pas réglé.");
  await run(
    "UPDATE refunds SET status = 'attente', paid_amount = NULL, method = NULL, paid_at = NULL, paid_by = NULL WHERE id = ?",
    [refundId]
  );
  const member = await get<{ name: string }>("SELECT name FROM memberships WHERE id = ?", [
    r.membership_id,
  ]);
  await logAudit({
    tontineId,
    actorUserId,
    action: "remboursement_annule",
    target: member?.name ?? null,
    amount: r.paid_amount,
    method: r.method,
  });
  return { ok: true };
}
