"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type BoardItem = {
  id: string;
  name: string;
  sub: string;
  line: string;
  badgeStatus: string;
  badgeLabel: string;
  late: boolean;
  isOpen: boolean;
};

type FilterKey = "toutes" | "cours" | "retard" | "cloturee";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "toutes", label: "Toutes" },
  { key: "cours", label: "En cours" },
  { key: "retard", label: "En retard" },
  { key: "cloturee", label: "Clôturées" },
];

const BADGE_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  due: "bg-stone-100 text-stone-600",
  late: "bg-red-100 text-red-700",
  beneficiary: "bg-orange-100 text-orange-700",
  done: "bg-stone-100 text-stone-500",
  closed: "bg-stone-800 text-stone-100",
  parti: "bg-amber-100 text-amber-800",
};

function matches(item: BoardItem, filter: FilterKey, query: string): boolean {
  if (filter === "cours" && !item.isOpen) return false;
  if (filter === "cloturee" && item.isOpen) return false;
  if (filter === "retard" && !(item.isOpen && item.late)) return false;
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.line.toLowerCase().includes(q) ||
    item.sub.toLowerCase().includes(q)
  );
}

export function TontineBoard({ items }: { items: BoardItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("toutes");

  const counts = useMemo(
    () => ({
      toutes: items.length,
      cours: items.filter((i) => i.isOpen).length,
      retard: items.filter((i) => i.isOpen && i.late).length,
      cloturee: items.filter((i) => !i.isOpen).length,
    }),
    [items]
  );

  const visible = items.filter((i) => matches(i, filter, query));

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une tontine…"
            aria-label="Rechercher une tontine"
            className="w-full rounded-xl border border-stone-300 bg-white py-3 pl-11 pr-4 text-base text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-orange-600 text-white shadow-sm"
                    : "border border-stone-300 bg-white text-stone-600 hover:border-orange-300 hover:text-orange-700"
                }`}
              >
                {f.label}{" "}
                <span className={active ? "text-orange-200" : "text-stone-400"}>
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <p className="font-semibold text-stone-700">Aucune tontine ne correspond.</p>
          <p className="mt-1 text-sm text-stone-500">
            Essayez un autre nom ou changez de filtre.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((item) => (
            <Link
              key={item.id}
              href={`/tontines/${item.id}`}
              className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow ${
                item.late && item.isOpen
                  ? "border-red-300 hover:border-red-400"
                  : "border-stone-200 hover:border-orange-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-stone-900 group-hover:text-orange-700">
                  {item.name}
                </h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    BADGE_STYLES[item.badgeStatus] ?? BADGE_STYLES.done
                  }`}
                >
                  {item.badgeLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-500">{item.sub}</p>
              <p className="mt-3 text-sm text-stone-600">
                {item.line}
                {item.late && item.isOpen && (
                  <span className="ml-2 font-semibold text-red-600">en retard</span>
                )}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
