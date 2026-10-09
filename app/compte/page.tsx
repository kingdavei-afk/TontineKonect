import Link from "next/link";
import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { formatPhone, getUser } from "@/lib/auth";
import { formatFcfa, formatDate, getUserContributions } from "@/lib/tontine";
import { logout } from "@/app/actions";

export default async function ComptePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const stats = await get<{ tontines: number }>(
    `SELECT COUNT(DISTINCT m.tontine_id) AS tontines
     FROM memberships m WHERE m.user_id = ?`,
    [user.id]
  );
  if (!stats) redirect("/login");

  const given = await get<{ total: number; n: number }>(
    `SELECT COALESCE(SUM(c.amount), 0) AS total, COUNT(*) AS n
     FROM contributions c JOIN memberships m ON m.id = c.membership_id
     WHERE m.user_id = ?`,
    [user.id]
  );
  if (!given) redirect("/login");

  const history = await getUserContributions(user.id, 100);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/tontines" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Mes tontines
      </Link>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-stone-900">{user.name}</h1>
        <p className="mt-1 text-stone-500">{formatPhone(user.phone)}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Tontines</p>
            <p className="mt-1 text-xl font-extrabold text-stone-900">{stats.tontines}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Versé au total</p>
            <p className="mt-1 text-xl font-extrabold text-stone-900">
              {formatFcfa(given.total)}
              <span className="ml-1 text-xs font-medium text-stone-400">{given.n} cotisations</span>
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-stone-900">Mon historique de cotisations</h2>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
            {history.length} cotisation{history.length > 1 ? "s" : ""} ·{" "}
            {formatFcfa(history.reduce((s, h) => s + h.amount, 0))}
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Tous vos paiements, dans toutes vos tontines, du plus récent au plus ancien.
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">Aucune cotisation pour l&apos;instant.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {history.map((h) => (
              <li key={`${h.tontine_id}-${h.idx}`} className="rounded-lg bg-stone-50 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/tontines/${h.tontine_id}`}
                    className="font-semibold text-stone-800 hover:text-orange-700"
                  >
                    {h.tontine_name}
                  </Link>
                  <span className="font-bold text-stone-900">{formatFcfa(h.amount)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
                  <span>Tour n°{h.idx}</span>
                  <span>
                    {formatDate(h.paid_at)} à {h.paid_at.slice(11, 16)}
                  </span>
                  <span>Mode : {h.method}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && history.length < given.n && (
          <p className="mt-3 text-xs text-stone-400">
            {given.n} cotisations au total — les {history.length} plus récentes sont affichées.
          </p>
        )}
      </section>

      <form action={logout}>
        <button className="w-full rounded-xl border border-stone-300 px-4 py-3 font-semibold text-stone-600 transition hover:border-red-300 hover:text-red-600">
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
