import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { get } from "@/lib/db";
import { getUser } from "@/lib/auth";
import {
  AUDIT_LABELS,
  getAllContributions,
  getAuditLogs,
  getMemberStats,
  getRefunds,
  getTontine,
  todayISO,
  type AuditAction,
} from "@/lib/tontine";
import { csvFilename, frDate, frDateTime, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Export CSV par tontine : `?type=cotisations`, `audit`, `membres` ou
 * `remboursements`. Réservé aux membres connectés de la tontine.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect("/login");

  const t = await getTontine(id);
  if (!t) redirect("/tontines");
  const member = await get("SELECT 1 AS x FROM memberships WHERE tontine_id = ? AND user_id = ?", [
    t.id,
    user.id,
  ]);
  if (!member) redirect(`/tontines/${t.id}`);

  const type = request.nextUrl.searchParams.get("type");
  let csv: string;
  let label: string;

  if (type === "cotisations") {
    const today = todayISO();
    const rows = (await getAllContributions(t.id)).map((c) => [
      c.idx,
      frDate(c.due_date),
      c.beneficiary ?? "",
      c.member,
      c.phone,
      c.amount,
      c.method,
      frDateTime(c.paid_at),
      c.paid_by_name ?? "",
      c.payout_done
        ? c.received_at
          ? "Pot reçu"
          : "Pot versé"
        : c.due_date < today
          ? "En retard"
          : "En cours",
    ]);
    csv = toCsv(
      [
        "Tour",
        "Échéance",
        "Bénéficiaire",
        "Membre",
        "Téléphone",
        "Montant (FCFA)",
        "Mode",
        "Payé le",
        "Validé par",
        "Statut du tour",
      ],
      rows
    );
    label = "cotisations";
  } else if (type === "audit") {
    const rows = (await getAuditLogs(t.id, 100000)).map((a) => [
      frDateTime(a.created_at),
      AUDIT_LABELS[a.action as AuditAction] ?? a.action,
      a.target ?? "",
      a.amount ?? "",
      a.method ?? "",
      a.note ?? "",
      a.actor_name ?? "",
      a.actor_phone ?? "",
    ]);
    csv = toCsv(
      ["Date", "Action", "Cible", "Montant (FCFA)", "Mode", "Note", "Auteur", "Téléphone"],
      rows
    );
    label = "journal-audit";
  } else if (type === "membres") {
    const rows = (await getMemberStats(t.id)).map((m) => [
      m.position,
      m.name,
      m.phone,
      m.status === "parti" ? "Parti" : "Actif",
      m.is_treasurer ? "Trésorier" : "Membre",
      m.paid_n,
      m.paid_total,
      frDate(m.joined_at),
      m.left_at ? frDate(m.left_at) : "",
    ]);
    csv = toCsv(
      [
        "Position",
        "Nom",
        "Téléphone",
        "Statut",
        "Rôle",
        "Cotisations (nb)",
        "Capital versé (FCFA)",
        "Membre depuis",
        "Parti le",
      ],
      rows
    );
    label = "membres";
  } else if (type === "remboursements") {
    const rows = (await getRefunds(t.id)).map((r) => [
      r.member.name,
      r.member.phone,
      frDate(r.created_at),
      r.amount,
      r.status === "paye" ? "Remboursé" : "À rembourser",
      r.paid_amount ?? "",
      r.method ?? "",
      r.paid_at ? frDateTime(r.paid_at) : "",
      r.paid_by_name ?? "",
      r.note ?? "",
    ]);
    csv = toCsv(
      [
        "Membre",
        "Téléphone",
        "Départ le",
        "Capital (FCFA)",
        "Statut",
        "Montant réglé (FCFA)",
        "Mode",
        "Réglé le",
        "Réglé par",
        "Note",
      ],
      rows
    );
    label = "remboursements";
  } else {
    return new Response(
      "Paramètre attendu : ?type=cotisations, audit, membres ou remboursements.",
      {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(`${t.name}-${label}`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
