import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { all, get, newId, run, type MembershipRow, type TontineRow } from "./db";
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
/* Clés VAPID (env VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en prod,       */
/* sinon fichier data/vapid.json en local — écriture disque indispo-   */
/* sible sur Vercel)                                                   */
/* ------------------------------------------------------------------ */

type VapidKeys = { publicKey: string; privateKey: string };

function vapidFile(): string {
  return path.join(process.cwd(), "data", "vapid.json");
}

export function getVapidKeys(): VapidKeys {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    return { publicKey, privateKey };
  }
  const cached = (globalThis as { __vapid?: VapidKeys }).__vapid;
  if (cached) return cached;
  try {
    const parsed = JSON.parse(fs.readFileSync(vapidFile(), "utf8")) as VapidKeys;
    if (parsed.publicKey && parsed.privateKey) {
      (globalThis as { __vapid?: VapidKeys }).__vapid = parsed;
      return parsed;
    }
  } catch {
    /* première exécution */
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(path.dirname(vapidFile()), { recursive: true });
  fs.writeFileSync(vapidFile(), JSON.stringify(keys, null, 2), { mode: 0o600 });
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

/** Enregistre (ou met à jour) l'abonnement push d'un utilisateur. */
export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionJson
): Promise<boolean> {
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (!endpoint || !p256dh || !auth) return false;
  await run(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
                                         p256dh = excluded.p256dh,
                                         auth = excluded.auth`,
    [newId(), userId, endpoint, p256dh, auth]
  );
  return true;
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await run("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [
    userId,
    endpoint,
  ]);
}

export async function subscriptionCount(userId: string): Promise<number> {
  const row = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  return row?.n ?? 0;
}

export async function hasSubscription(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  return (await subscriptionCount(userId)) > 0;
}

/* ------------------------------------------------------------------ */
/* Envoi                                                               */
/* ------------------------------------------------------------------ */

export type PushPayload = { title: string; body: string; url: string };

async function sendToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; subs: number; error?: string }> {
  const subs = await all<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    "SELECT * FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
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
        await run("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
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

  const tontines = await all<TontineRow>("SELECT * FROM tontines WHERE status = 'actif'");

  for (const t of tontines) {
    report.scanned++;
    const members = await getMembers(t.id);
    if (members.length === 0) continue;
    const cycles = await ensureCycles(t);
    const cur = currentCycle(cycles);
    if (!cur) continue;

    const stage = stageFor(daysBetween(today, cur.due_date));
    if (!stage) continue;

    const paidRows = await all<{ membership_id: string }>(
      "SELECT membership_id FROM contributions WHERE cycle_id = $1",
      [cur.id]
    );
    const paidIds = new Set(paidRows.map((r) => r.membership_id));

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
      const inserted = await run(
        `INSERT INTO reminders (id, tontine_id, cycle_id, membership_id, kind, stage)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cycle_id, membership_id, kind, stage) DO NOTHING`,
        [newId(), t.id, cur.id, job.member.id, job.kind, stage]
      );
      if (inserted === 0) continue; // déjà envoyé pour cette étape
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

/**
 * Démarre la boucle de rappels (une seule fois par processus).
 * Sur Vercel, la boucle est inutile : c'est le cron (/api/reminders) qui
 * déclenche runReminders, les instances serverless étant éphémères.
 */
export function startReminderScheduler(): void {
  if (process.env.VERCEL) return;
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

export async function pushStatusForTontine(
  tontineId: string
): Promise<Record<string, boolean>> {
  const rows = await all<{ membership_id: string; subs: number }>(
    `SELECT m.id AS membership_id, COUNT(p.id) AS subs
     FROM memberships m
     LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN push_subscriptions p ON p.user_id = u.id
     WHERE m.tontine_id = $1
     GROUP BY m.id`,
    [tontineId]
  );
  const map: Record<string, boolean> = {};
  for (const r of rows) map[r.membership_id] = r.subs > 0;
  return map;
}
