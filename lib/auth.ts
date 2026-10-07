import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db, type UserRow } from "./db";

const SESSION_DAYS = 30;
const COOKIE = "tk_sid";

export type SessionUser = { id: string; phone: string; name: string };

/* ---------- PIN (scrypt) ---------- */

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

/* ---------- Téléphone ---------- */

/** Normalise un numéro ivoirien : "07 07 12 34 56", "+225 07 07 12 34 56" -> "0707123456" */
export function normalizePhone(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("225") && d.length > 10) d = d.slice(3);
  // Format actuel (depuis 2021) : 10 chiffres, ex. 07 07 12 34 56
  if (d.length === 10 && /^0[157]/.test(d)) return d;
  // Ancien format : 8 chiffres, ex. 07 12 34 56
  if (d.length === 8 && /^0[157]/.test(d)) return d;
  return null;
}

export function formatPhone(phone: string): string {
  return `+225 ${phone.replace(/(\d{2})(?=\d)/g, "$1 ").trim()}`;
}

export function waLink(phone: string, text: string): string {
  const international = phone.startsWith("0") ? `225${phone}` : phone;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

/* ---------- Sessions ---------- */

export async function getUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const sid = store.get(COOKIE)?.value;
  if (!sid) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.phone, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .get(sid) as SessionUser | undefined;
  return row ?? null;
}

export async function createUserSession(userId: string): Promise<void> {
  const sid = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+' || ? || ' days'))`
  ).run(sid, userId, SESSION_DAYS);
  const store = await cookies();
  store.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroyUserSession(): Promise<void> {
  const store = await cookies();
  const sid = store.get(COOKIE)?.value;
  if (sid) db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
  store.delete(COOKIE);
}

export function findUserByPhone(phone: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as UserRow | undefined;
}
