"use client";

import { useState } from "react";
import { formatFcfa, formatDate } from "@/lib/constants";

export type HistoryRow = {
  membershipId: string;
  member: string;
  idx: number;
  beneficiary: string | null;
  amount: number;
  method: string;
  paidAt: string;
  paidByName: string | null;
  payoutDone: number;
  receivedAt: string | null;
};

export type HistoryMember = { id: string; name: string; status: string };

const selectCls =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200";

/**
 * Historique des cotisations d'une tontine, filtrable par membre
 * (« Moi » par défaut : chaque membre voit d'abord les siennes) et par tour.
 */
export function CotisationsHistory({
  rows,
  members,
  tours,
  meId,
}: {
  rows: HistoryRow[];
  members: HistoryMember[];
  tours: number[];
  meId: string;
}) {
  const [memberFilter, setMemberFilter] = useState<string>(meId);
  const [tourFilter, setTourFilter] = useState<string>("all");

  const visible = rows.filter(
    (r) =>
      (memberFilter === "all" || r.membershipId === memberFilter) &&
      (tourFilter === "all" || r.idx === Number(tourFilter))
  );
  const total = visible.reduce((s, r) => s + r.amount, 0);
  const isFiltered = memberFilter !== meId || tourFilter !== "all";
  const showMemberName = memberFilter === "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-400">
            Membre
          </span>
          <select
            aria-label="Filtrer par membre"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            className={selectCls}
          >
            <option value={meId}>Moi</option>
            <option value="all">Tous les membres</option>
            {members
              .filter((m) => m.id !== meId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.status === "parti" ? " (parti)" : ""}
                </option>
              ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-400">
            Tour
          </span>
          <select
            aria-label="Filtrer par tour"
            value={tourFilter}
            onChange={(e) => setTourFilter(e.target.value)}
            className={selectCls}
          >
            <option value="all">Tous les tours</option>
            {tours.map((i) => (
              <option key={i} value={String(i)}>
                Tour n°{i}
              </option>
            ))}
          </select>
        </label>

        <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-800">
          {visible.length} cotisation{visible.length > 1 ? "s" : ""} · {formatFcfa(total)}
        </span>

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setMemberFilter(meId);
              setTourFilter("all");
            }}
            className="text-xs font-semibold text-stone-400 underline hover:text-stone-700"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-stone-400">
          {rows.length === 0
            ? "Aucune cotisation enregistrée pour l'instant."
            : "Aucune cotisation ne correspond à ce filtre."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={`${r.membershipId}-${r.idx}`}
              className="rounded-lg bg-stone-50 px-3 py-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-stone-800">
                  Tour n°{r.idx}
                  {showMemberName && (
                    <span className="font-normal text-stone-600"> · {r.member}</span>
                  )}
                  <span className="font-normal text-stone-500">
                    {" "}
                    · pour {r.beneficiary ?? "?"}
                  </span>
                </span>
                <span className="font-bold text-stone-900">{formatFcfa(r.amount)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                <span>
                  {formatDate(r.paidAt)} à {r.paidAt.slice(11, 16)}
                </span>
                <span>Mode : {r.method}</span>
                <span className="font-medium text-stone-600">
                  Validé par {r.paidByName ?? "compte supprimé"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    r.receivedAt
                      ? "bg-emerald-100 text-emerald-800"
                      : r.payoutDone
                        ? "bg-amber-100 text-amber-800"
                        : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {r.receivedAt ? "Pot reçu" : r.payoutDone ? "Pot versé" : "Tour en cours"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
