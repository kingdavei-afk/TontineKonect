import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/**
 * Déclenche manuellement le passage des rappels (utile pour un cron externe
 * ou pour tester). Secret : variable CRON_SECRET, sinon "local-dev" en local.
 */
async function handle(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  // Vercel Cron envoie `Authorization: Bearer <CRON_SECRET>` ; en local on
  // accepte aussi ?secret= ou l'en-tête x-cron-secret.
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const secret = bearer ?? url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET ?? "local-dev";
  if (secret !== expected) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  const report = await runReminders();
  return NextResponse.json(report);
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
