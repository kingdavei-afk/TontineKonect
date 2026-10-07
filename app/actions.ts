"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, newId, type CycleRow, type MembershipRow } from "@/lib/db";
import {
  createUserSession,
  destroyUserSession,
  findUserByPhone,
  getUser,
  hashPin,
  normalizePhone,
  verifyPin,
} from "@/lib/auth";
import {
  removeSubscription,
  saveSubscription,
  type PushSubscriptionJson,
} from "@/lib/reminders";
import {
  addMember,
  changeAmount,
  closeTontine,
  confirmCycleReceipt,
  cycleAmount,
  ensureCycles,
  generateInviteCode,
  getTontine,
  getTontineByCode,
  leaveMember,
  linkPendingMemberships,
  markContribution,
  markPayout,
  markRefundPaid,
  unmarkContribution,
  unmarkRefundPaid,
} from "@/lib/tontine";

export type FormState = { error?: string; ok?: boolean; message?: string };

async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

async function requireTreasurer(tontineId: string, userId: string) {
  const t = getTontine(tontineId);
  if (!t) redirect("/tontines");
  const m = db
    .prepare("SELECT * FROM memberships WHERE tontine_id = ? AND user_id = ?")
    .get(tontineId, userId) as MembershipRow | undefined;
  if (!m || !m.is_treasurer) redirect(`/tontines/${tontineId}`);
  return { t, membership: m };
}

/* ---------- Auth ---------- */

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const pin = String(formData.get("pin") ?? "");

  if (name.length < 2) return { error: "Entrez votre nom complet." };
  if (!phone) return { error: "Numéro invalide. Format : 07 07 12 34 56." };
  if (!/^\d{4,6}$/.test(pin)) return { error: "Le code secret doit contenir 4 à 6 chiffres." };
  if (findUserByPhone(phone)) return { error: "Un compte existe déjà avec ce numéro." };

  const id = newId();
  db.prepare("INSERT INTO users (id, phone, name, pin) VALUES (?, ?, ?, ?)").run(
    id,
    phone,
    name,
    hashPin(pin)
  );
  linkPendingMemberships(id, phone, name);
  await createUserSession(id);
  redirect("/tontines");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const pin = String(formData.get("pin") ?? "");
  const user = phone ? findUserByPhone(phone) : undefined;
  if (!user || !verifyPin(pin, user.pin)) {
    return { error: "Numéro ou code secret incorrect." };
  }
  await createUserSession(user.id);
  redirect("/tontines");
}

export async function logout(): Promise<void> {
  await destroyUserSession();
  redirect("/");
}

/* ---------- Tontines ---------- */

export async function createTontine(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const frequency = String(formData.get("frequency") ?? "");
  const startDate = String(formData.get("start_date") ?? "");

  if (name.length < 3) return { error: "Donnez un nom à votre tontine (3 caractères min)." };
  if (!Number.isFinite(amount) || amount < 500) return { error: "La cotisation minimum est de 500 F." };
  if (!["hebdo", "bimensuel", "mensuel"].includes(frequency)) return { error: "Fréquence invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Date de début invalide." };

  const tontineId = newId();
  db.prepare(
    `INSERT INTO tontines (id, name, amount, frequency, start_date, creator_id, invite_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(tontineId, name, Math.round(amount), frequency, startDate, user.id, generateInviteCode());

  addMember({
    tontineId,
    phone: user.phone,
    name: user.name,
    userId: user.id,
    treasurer: true,
    actorUserId: user.id,
  });
  const t = getTontine(tontineId)!;
  ensureCycles(t);

  redirect(`/tontines/${tontineId}`);
}

export async function joinTontine(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const t = getTontineByCode(code);
  if (!t) return { error: "Code d'invitation introuvable." };

  const existing = db
    .prepare("SELECT id FROM memberships WHERE tontine_id = ? AND phone = ?")
    .get(t.id, user.phone);
  if (existing) redirect(`/tontines/${t.id}`);

  addMember({ tontineId: t.id, phone: user.phone, name: user.name, userId: user.id, actorUserId: user.id });
  ensureCycles(t);
  redirect(`/tontines/${t.id}`);
}

export async function addMemberManually(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  const { t } = await requireTreasurer(tontineId, user.id);
  if (t.status !== "actif") return { error: "Tontine clôturée : impossible d'ajouter un membre." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (name.length < 2) return { error: "Entrez le nom du membre." };
  if (!phone) return { error: "Numéro invalide. Format : 07 07 12 34 56." };

  const linked = findUserByPhone(phone);
  addMember({
    tontineId,
    phone,
    name,
    userId: linked ? linked.id : null,
    actorUserId: user.id,
  });
  ensureCycles(t);
  revalidatePath(`/tontines/${tontineId}`);
  return { ok: true };
}

/* ---------- Cotisations ---------- */

export async function pay(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  const cycleId = String(formData.get("cycle_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  const method = String(formData.get("method") ?? "");
  const { t } = await requireTreasurer(tontineId, user.id);
  if (t.status !== "actif") redirect(`/tontines/${tontineId}`);

  const m = db.prepare("SELECT * FROM memberships WHERE id = ? AND tontine_id = ?").get(membershipId, tontineId);
  if (!m) redirect(`/tontines/${tontineId}`);
  const cycle = db
    .prepare("SELECT * FROM cycles WHERE id = ? AND tontine_id = ?")
    .get(cycleId, tontineId) as CycleRow | undefined;
  if (!cycle) redirect(`/tontines/${tontineId}`);

  markContribution({
    cycleId,
    membershipId,
    amount: cycleAmount(cycle, t),
    method,
    paidBy: user.id,
  });
  revalidatePath(`/tontines/${tontineId}`);
}

export async function unpay(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  const cycleId = String(formData.get("cycle_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  await requireTreasurer(tontineId, user.id);

  unmarkContribution(cycleId, membershipId, user.id);
  revalidatePath(`/tontines/${tontineId}`);
}

/* ---------- Notifications push ---------- */

export async function savePushSubscription(
  sub: PushSubscriptionJson
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  return { ok: saveSubscription(user.id, sub) };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  removeSubscription(user.id, endpoint);
  return { ok: true };
}

export async function payout(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  const cycleId = String(formData.get("cycle_id") ?? "");
  const action = String(formData.get("action") ?? "done");
  const { t } = await requireTreasurer(tontineId, user.id);
  if (t.status !== "actif") redirect(`/tontines/${tontineId}`);

  markPayout(cycleId, action === "done", user.id);
  revalidatePath(`/tontines/${tontineId}`);
}

/** Le bénéficiaire confirme avoir bien reçu le pot : le tour suivant s'ouvre. */
export async function confirmReceiptAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  const cycleId = String(formData.get("cycle_id") ?? "");
  const t = getTontine(tontineId);
  if (!t) redirect("/tontines");

  const me = db
    .prepare("SELECT * FROM memberships WHERE tontine_id = ? AND user_id = ?")
    .get(tontineId, user.id) as MembershipRow | undefined;
  if (!me) redirect(`/tontines/${tontineId}`);

  const cycle = db
    .prepare("SELECT * FROM cycles WHERE id = ? AND tontine_id = ?")
    .get(cycleId, tontineId) as CycleRow | undefined;
  if (!cycle) redirect(`/tontines/${tontineId}`);

  const isBeneficiary = cycle.beneficiary_id === me.id;
  if (!isBeneficiary && !me.is_treasurer) redirect(`/tontines/${tontineId}`);

  confirmCycleReceipt({
    cycleId,
    actorUserId: user.id,
    actorMembershipId: me.id,
    byTreasurer: !isBeneficiary,
  });
  revalidatePath(`/tontines/${tontineId}`);
}

/* ---------- Sortie d'argent : montant, départs, remboursements, clôture ---------- */

export async function changeAmountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  await requireTreasurer(tontineId, user.id);
  const amount = Number(formData.get("amount"));

  const res = changeAmount(tontineId, amount, user.id);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/tontines/${tontineId}`);
  return { ok: true, message: res.message };
}

export async function leaveMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  await requireTreasurer(tontineId, user.id);
  const membershipId = String(formData.get("membership_id") ?? "");

  const res = leaveMember(tontineId, membershipId, user.id);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/tontines/${tontineId}`);
  return { ok: true, message: res.message };
}

export async function markRefundPaidAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  await requireTreasurer(tontineId, user.id);

  const res = markRefundPaid({
    refundId: String(formData.get("refund_id") ?? ""),
    tontineId,
    amount: Number(formData.get("amount")),
    method: String(formData.get("method") ?? "Espèces"),
    note: String(formData.get("note") ?? ""),
    paidBy: user.id,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/tontines/${tontineId}`);
  return { ok: true };
}

export async function unmarkRefundPaidAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  await requireTreasurer(tontineId, user.id);
  unmarkRefundPaid(String(formData.get("refund_id") ?? ""), tontineId, user.id);
  revalidatePath(`/tontines/${tontineId}`);
}

export async function closeTontineAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const tontineId = String(formData.get("tontine_id") ?? "");
  await requireTreasurer(tontineId, user.id);

  const res = closeTontine(tontineId, user.id);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/tontines/${tontineId}`);
  revalidatePath("/tontines");
  return { ok: true, message: res.message };
}
