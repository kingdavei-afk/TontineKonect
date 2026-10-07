import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { db, newId, type MembershipRow, type TontineRow } from "./db";
import {
  cycleAmount,
  currentCycle,
  ensureCycles,
  expectedPayers,
  formatFcfa,
  formatDate,
  frequencyLabel,
  getMembers,
  todayISO,
} from "./tontine";

/* ------------------------------------------------------------------ */
/* Clés VAPID (générées une fois, stockées dans data/vapid.json)        */
/* ------------------------------------------------------------------ */

type VapidKeys = { publicKey: string; privateKey: string };

function vapidFile(): string {
  return path.join(process.cwd(), "data", "vapid.json");
}

export function getVapidKeys(): VapidKeys {
  const file = vapidFile();
  const cached = (globalThis as { __vapid?: VapidKeys }).__vapid;
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as VapidKeys;
    if (parsed.publicKey && parsed.privateKey) {
      (globalThis as { __vapid?: VapidKeys }).__vapid = parsed;
      return parsed;
    }
  } catch {
    /* première exécution */
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  (globalThis as { __vapid?: VapidKeys }).__vapid = keys;
  return keys;
}

export function getVapidPublicKey(): string {
  return getVapidKeys().publicKey;
}

/* ------------------------------------------------------------------ */
/* Abonnements                                                         */
/* ------------------------------------------------------------------ */

export type PushSubscriptionJson = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/** Enregistre (ou remet à jour) l'abonnement push d'un utilisateur. */
export function saveSubscription(userId: string, sub: PushSubscriptionJson): boolean {
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) return false;
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
                                         p256dh = excluded.p256dh,
                                         auth = excluded.auth`
  ).run(newId(), userId, endpoint, p256dh, auth);
  return true;
}

export function removeSubscription(userId: string, endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(
    userId,
    endpoint
  );
}

export function subscriptionCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?")
    .get(userId) as { n: number };
  return row.n;
}

export function hasSubscription(userId: string | null): boolean {
  if (!userId) return false;
  return subscriptionCount(userId) > 0;
}

/* ------------------------------------------------------------------ */
/* Envoi                                                               */
/* ------------------------------------------------------------------ */

export type PushPayload = { title: string; body: string; url: string };

async function sendToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; subs: number; error?: string }> {
  const subs = db
    .prepare("SELECT * FROM push_subscriptions WHERE user_id = ?")
    .all(userId) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  if (subs.length === 0) return { sent: 0, subs: 0 };

  const { publicKey, privateKey } = getVapidKeys();
  const options = {
    vapidDetails: {
      subject: "mailto:support@tontinekonect.ci",
      publicKey,
      privateKey,
    },
  };

  let sent = 0;
  let lastError: string | undefined;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        options
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const message = `${status ?? "?"} ${String((err as Error)?.message ?? err)}`;
      lastError = `${s.endpoint} → ${message}`;
      if (status === 404 || status === 410) {
        // Abonnement expiré ou révoqué par le navigateur.
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(s.id);
      } else {
        console.error("[reminders] envoi push échoué:", message);
      }
    }
  }
  return { sent, subs: subs.length, error: lastError };
}

/* ------------------------------------------------------------------ */
/* Moteur de rappels                                                   */
/* ------------------------------------------------------------------ */

export type Stage = "avant" | "jour" | "retard";

export type ReminderReport = {
  scanned: number;
  created: number;
  sent: number;
  noSubscription: number;
  errors: number;
  details?: string[];
};

/** J-2 (et J-1), jour de l'échéance, puis retard. Un seul envoi par étape. */
export function stageFor(daysLeft: number): Stage | null {
  if (daysLeft > 2) return null;
  if (daysLeft >= 1) return "avant";
  if (daysLeft === 0) return "jour";
  return "retard";
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function stageMessage(
  stage: Stage,
  t: TontineRow,
  idx: number,
  amount: number,
  dueDate: string
): { title: string; body: string } {
  const when = formatDate(dueDate);
  if (stage === "jour")
    return {
      title: `💰 Échéance aujourd'hui — ${t.name}`,
      body: `Ta cotisation de ${formatFcfa(amount)} pour le tour n°${idx} est à régler aujourd'hui.`,
    };
  if (stage === "retard")
    return {
      title: `⏰ Cotisation en retard — ${t.name}`,
      body: `${formatFcfa(amount)} dus depuis le ${when} (tour n°${idx}). Règle vite pour ne pas pénaliser le groupe.`,
    };
  return {
    title: `🔔 Échéance le ${when} — ${t.name}`,
    body: `Ta cotisation de ${formatFcfa(amount)} pour le tour n°${idx} arrive. Pense à préparer l'argent.`,
  };
}

/**
 * Parcourt les tontines actives, crée les rappels dus (une seule fois par
 * étape) et envoie les notifications push correspondantes.
 */
export async function runReminders(today = todayISO()): Promise<ReminderReport> {
  const report: ReminderReport = {
    scanned: 0,
    created: 0,
    sent: 0,
    noSubscription: 0,
    errors: 0,
  };

  const tontines = db
    .prepare("SELECT * FROM tontines WHERE status = 'actif'")
    .all() as TontineRow[];

  const insertReminder = db.prepare(
    `INSERT OR IGNORE INTO reminders (id, tontine_id, cycle_id, membership_id, kind, stage)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const t of tontines) {
    report.scanned++;
    const members = getMembers(t.id);
    if (members.length === 0) continue;
    const cycles = ensureCycles(t);
    const cur = currentCycle(cycles);
    if (!cur) continue;

    const stage = stageFor(daysBetween(today, cur.due_date));
    if (!stage) continue;

    const paidIds = new Set(
      (
        db
          .prepare("SELECT membership_id FROM contributions WHERE cycle_id = ?")
          .all(cur.id) as { membership_id: string }[]
      ).map((r) => r.membership_id)
    );

    const unpaid = expectedPayers(members, paidIds).filter((m) => !paidIds.has(m.id));
    if (unpaid.length === 0) continue;

    const amount = cycleAmount(cur, t);
    const expected = expectedPayers(members, paidIds).length;

    const jobs: { member: MembershipRow; kind: "membre" | "tresorier"; payload: PushPayload }[] =
      [];

    // 1. Chaque membre en retard de cotisation.
    for (const m of unpaid) {
      jobs.push({
        member: m,
        kind: "membre",
        payload: {
          ...stageMessage(stage, t, cur.idx, amount, cur.due_date),
          url: `/tontines/${t.id}`,
        },
      });
    }

    // 2. Le trésorier : synthèse des cotisations manquantes.
    const treasurer = members.find((m) => m.is_treasurer === 1);
    if (treasurer) {
      jobs.push({
        member: treasurer,
        kind: "tresorier",
        payload: {
          title: `📊 ${unpaid.length} cotisation(s) manquante(s) — ${t.name}`,
          body: `Tour n°${cur.idx} (${frequencyLabel(t.frequency).toLowerCase()}), échéance le ${formatDate(
            cur.due_date
          )} : ${paidIds.size}/${expected} cotisations reçues.`,
          url: `/tontines/${t.id}`,
        },
      });
    }

    for (const job of jobs) {
      const res = insertReminder.run(
        newId(),
        t.id,
        cur.id,
        job.member.id,
        job.kind,
        stage
      );
      if (res.changes === 0) continue; // déjà envoyé pour cette étape
      report.created++;
      try {
        if (!job.member.user_id) {
          report.noSubscription++;
          continue;
        }
        const res = await sendToUser(job.member.user_id, job.payload);
        report.sent += res.sent;
        if (res.error) {
          report.errors++;
          (report.details ??= []).push(`${job.kind}: ${res.error}`);
        } else if (res.sent === 0) {
          report.noSubscription++;
        }
      } catch (err) {
        report.errors++;
        (report.details ??= []).push(String(err));
        console.error("[reminders]", err);
      }
    }
  }

  return report;
}

/* ------------------------------------------------------------------ */
/* Planification                                                       */
/* ------------------------------------------------------------------ */

const INTERVAL_MS = 10 * 60 * 1000; // toutes les 10 minutes
const FIRST_RUN_MS = 15 * 1000; // un peu après le démarrage du serveur

/** Démarre la boucle de rappels (une seule fois par processus). */
export function startReminderScheduler(): void {
  const g = globalThis as { __reminderTimer?: ReturnType<typeof setInterval> };
  if (g.__reminderTimer) return;

  const tick = () => {
    runReminders()
      .then((report) => {
        if (report.created > 0 || report.errors > 0) console.log("[reminders]", report);
      })
      .catch((err) => console.error("[reminders] erreur planifiée:", err));
  };

  g.__reminderTimer = setInterval(tick, INTERVAL_MS);
  // Ne pas bloquer le démarrage du serveur.
  setTimeout(tick, FIRST_RUN_MS).unref?.();
}

/* ------------------------------------------------------------------ */
/* Aide serveur (affichage des statuts dans l'interface)               */
/* ------------------------------------------------------------------ */

export function pushStatusForTontine(tontineId: string): Record<string, boolean> {
  const rows = db
    .prepare(
      `SELECT m.id AS membership_id, COUNT(p.id) AS subs
       FROM memberships m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN push_subscriptions p ON p.user_id = u.id
       WHERE m.tontine_id = ?
       GROUP BY m.id`
    )
    .all(tontineId) as { membership_id: string; subs: number }[];
  const map: Record<string, boolean> = {};
  for (const r of rows) map[r.membership_id] = r.subs > 0;
  return map;
}
