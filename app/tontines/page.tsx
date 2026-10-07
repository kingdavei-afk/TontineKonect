import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import {
  currentCycle,
  ensureCycles,
  formatFcfa,
  formatDate,
  frequencyLabel,
  getCycles,
  getTontine,
  isLate,
  todayISO,
} from "@/lib/tontine";
import { CreateTontineForm, JoinTontineForm } from "@/components/forms";
import { TontineBoard, type BoardItem } from "@/components/tontine-board";

const STATUS_LABELS: Record<string, string> = {
  paid: "À jour",
  due: "À cotiser",
  late: "En retard",
  beneficiary: "Votre tour 🎉",
  done: "Terminée",
  closed: "Clôturée",
  parti: "Vous êtes parti",
};

export default async function TontinesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { code } = await searchParams;

  const rows = db
    .prepare(
      `SELECT t.id, m.id AS membership_id, m.status AS membership_status
       FROM memberships m JOIN tontines t ON t.id = m.tontine_id
       WHERE m.user_id = ? ORDER BY t.created_at DESC`
    )
    .all(user.id) as { id: string; membership_id: string; membership_status: string }[];

  const cards = rows.flatMap((r) => {
    const t = getTontine(r.id);
    if (!t) return [];
    const isOpen = t.status === "actif";
    const cycles = isOpen ? ensureCycles(t) : getCycles(t.id);
    const cur = currentCycle(cycles);
    const members = db
      .prepare("SELECT COUNT(*) AS n FROM memberships WHERE tontine_id = ?")
      .get(t.id) as { n: number };
    let myStatus: "paid" | "due" | "late" | "beneficiary" | "done" | "closed" | "parti" = "done";
    if (!isOpen) myStatus = "closed";
    else if (r.membership_status === "parti") myStatus = "parti";
    else if (cur) {
      const iPaid = db
        .prepare("SELECT 1 FROM contributions WHERE cycle_id = ? AND membership_id = ?")
        .get(cur.id, r.membership_id);
      if (cur.beneficiary_id === r.membership_id) myStatus = "beneficiary";
      else if (iPaid) myStatus = "paid";
      else if (cur.due_date < todayISO()) myStatus = "late";
      else myStatus = "due";
    }
    return [
      {
        item: {
          id: t.id,
          name: t.name,
          sub: `${formatFcfa(t.amount)} / ${frequencyLabel(t.frequency).toLowerCase()} · ${members.n} membres`,
          line: !isOpen
            ? "Tontine clôturée — lecture seule"
            : cur
              ? `Tour n°${cur.idx} — échéance du ${formatDate(cur.due_date)}`
              : "Tous les tours sont terminés 🎉",
          badgeStatus: myStatus,
          badgeLabel: STATUS_LABELS[myStatus] ?? myStatus,
          late: isOpen && !!cur && isLate(cur),
          isOpen,
        } satisfies BoardItem,
      },
    ];
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Bonjour {user.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-stone-500">Vos tontines en cours.</p>
        </div>
        <Link
          href="/compte"
          className="text-sm font-semibold text-orange-700 underline underline-offset-2"
        >
          Mon compte
        </Link>
      </div>

      {cards.length > 0 ? (
        <TontineBoard items={cards.map((c) => c.item)} />
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <p className="font-semibold text-stone-700">Aucune tontine pour le moment.</p>
          <p className="mt-1 text-sm text-stone-500">
            Créez la vôre ou rejoignez-en une avec un code d&apos;invitation.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-stone-900">Créer une tontine</h2>
          <div className="mt-4">
            <CreateTontineForm defaultDate={todayISO()} />
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-stone-900">Rejoindre avec un code</h2>
          <p className="mt-1 mb-4 text-sm text-stone-500">
            Demandez le code d&apos;invitation au trésorier de la tontine.
          </p>
          <JoinTontineForm defaultCode={code ?? ""} />
        </section>
      </div>
    </div>
  );
}

