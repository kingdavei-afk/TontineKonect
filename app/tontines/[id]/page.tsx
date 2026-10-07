import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import {
  AUDIT_LABELS,
  cycleAmount,
  currentCycle,
  ensureCycles,
  expectedPayers,
  formatFcfa,
  formatDate,
  frequencyLabel,
  getAuditLogs,
  getCycleContributions,
  getCycles,
  getAmountChanges,
  getAllContributions,
  getMembers,
  getRefunds,
  getTontine,
  isLate,
  METHODS,
  type AuditAction,
} from "@/lib/tontine";
import { pushStatusForTontine } from "@/lib/reminders";
import { confirmReceiptAction, pay, payout, unpay, unmarkRefundPaidAction } from "@/app/actions";
import {
  AddMemberForm,
  ChangeAmountForm,
  CloseTontineForm,
  CopyButton,
  LeaveMemberForm,
  MarkRefundForm,
} from "@/components/forms";
import {
  CotisationsHistory,
  type HistoryRow,
} from "@/components/cotisations-history";

export default async function TontineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect("/login");

  const t = getTontine(id);
  if (!t) redirect("/tontines");

  const members = getMembers(t.id);
  const me = members.find((m) => m.user_id === user.id);
  if (!me) redirect(`/tontines?code=${t.invite_code}`);

  const isOpen = t.status === "actif";
  const cycles = isOpen ? ensureCycles(t) : getCycles(t.id);
  const cur = currentCycle(cycles);
  const curContribs = cur ? getCycleContributions(cur.id) : [];
  const paidIds = new Set(curContribs.map((c) => c.membership_id));
  const expected = cur ? expectedPayers(members, paidIds) : [];
  const unpaid = expected.filter((m) => !paidIds.has(m.id));
  const beneficiary = cur ? members.find((m) => m.id === cur.beneficiary_id) ?? null : null;
  const isTreasurer = !!me.is_treasurer;
  const history = cycles.filter((c) => c.payout_done && c.id !== cur?.id);
  const pushStatus = pushStatusForTontine(t.id);
  const refunds = getRefunds(t.id);
  const pendingRefunds = refunds.filter((r) => r.status === "attente");
  const changes = getAmountChanges(t.id);
  const activeCount = members.filter((m) => m.status !== "parti").length;
  const audit = getAuditLogs(t.id);

  const allContribs = getAllContributions(t.id);
  const myContribs = allContribs.filter((c) => c.membership_id === me.id);
  const myPaid = {
    n: myContribs.length,
    total: myContribs.reduce((s, c) => s + c.amount, 0),
  };
  const historyRows: HistoryRow[] = allContribs.map((c) => ({
    membershipId: c.membership_id,
    member: c.member,
    idx: c.idx,
    beneficiary: c.beneficiary,
    amount: c.amount,
    method: c.method,
    paidAt: c.paid_at,
    paidByName: c.paid_by_name,
    payoutDone: c.payout_done,
    receivedAt: c.received_at,
  }));
  const oweNow =
    isOpen &&
    !!cur &&
    me.status !== "parti" &&
    expected.some((m) => m.id === me.id) &&
    !paidIds.has(me.id);

  const curAmount = cur ? cycleAmount(cur, t) : t.amount;
  const potAttendu = cur ? curAmount * expected.length : 0;
  const encaisse = curContribs.reduce((s, c) => s + c.amount, 0);
  const inviteText = `Rejoins la tontine "${t.name}" sur Tontine Konect 📲 Code d'invitation : ${t.invite_code}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/tontines" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
          ← Mes tontines
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-stone-900 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-white">
            {t.invite_code}
          </span>
          <CopyButton text={t.invite_code} />
          {isOpen && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Inviter par WhatsApp
            </a>
          )}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold text-stone-900">{t.name}</h1>
          {!isOpen && (
            <span className="rounded-full bg-stone-200 px-3 py-1 text-sm font-bold text-stone-600">
              Clôturée
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {formatFcfa(t.amount)} par cotisation · {frequencyLabel(t.frequency)} · début le{" "}
          {formatDate(t.start_date)} · vous êtes {isTreasurer ? "trésorier" : "membre"}
        </p>
      </div>

      {!isOpen && (
        <div className="rounded-2xl border border-stone-300 bg-stone-100 p-4 text-sm text-stone-700">
          <p className="font-bold">Tontine clôturée{t.closed_at ? ` le ${formatDate(t.closed_at)}` : ""}.</p>
          <p className="mt-1">
            Les tours restants sont annulés, plus aucune cotisation ni départ. L&apos;historique reste
            consultable {pendingRefunds.length > 0 && "et les remboursements en attente doivent encore être réglés"}.
          </p>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Pot du tour" value={formatFcfa(potAttendu)} />
        <Kpi label="Membres actifs" value={`${activeCount} / ${members.length}`} />
        <Kpi label="Tour en cours" value={cur ? `${cur.idx} / ${cycles.length}` : "—"} />
        <Kpi label="Mes cotisations" value={`${myPaid.n} · ${formatFcfa(myPaid.total)}`} />
      </div>

      {/* Tour en cours */}
      {cur && beneficiary ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Tour n°{cur.idx} — bénéficiaire
              </p>
              <p className="mt-1 text-xl font-bold text-stone-900">
                {beneficiary.name} {beneficiary.id === me.id ? "(vous 🎉)" : ""}
                {beneficiary.status === "parti" && (
                  <span className="ml-2 text-sm font-semibold text-stone-400">(parti)</span>
                )}
              </p>
              <p className="text-sm text-stone-500">
                Cotisation de ce tour : <strong>{formatFcfa(curAmount)}</strong> · pot à verser{" "}
                <strong>{formatFcfa(potAttendu)}</strong> · échéance du{" "}
                <strong className={isLate(cur) ? "text-red-600" : ""}>{formatDate(cur.due_date)}</strong>
                {isLate(cur) && <span className="ml-2 font-semibold text-red-600">en retard</span>}
              </p>
            </div>
            {cur.payout_done ? (
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                    cur.received_at ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {cur.received_at
                    ? `✅ Pot reçu le ${formatDate(cur.received_at)}`
                    : `Pot versé le ${cur.payout_at ? formatDate(cur.payout_at) : ""}`}
                </span>
                {!cur.received_at &&
                  (isOpen && beneficiary.id === me.id ? (
                    <form action={confirmReceiptAction}>
                      <input type="hidden" name="tontine_id" value={t.id} />
                      <input type="hidden" name="cycle_id" value={cur.id} />
                      <button className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                        ✅ J&apos;ai bien reçu le pot
                      </button>
                    </form>
                  ) : isOpen && isTreasurer && !beneficiary.user_id ? (
                    <form action={confirmReceiptAction}>
                      <input type="hidden" name="tontine_id" value={t.id} />
                      <input type="hidden" name="cycle_id" value={cur.id} />
                      <button className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100">
                        Confirmer la réception de {beneficiary.name.split(" ")[0]}
                      </button>
                      <p className="mt-1 text-right text-xs text-stone-400">
                        {beneficiary.name} n&apos;a pas encore de compte : confirmez en son nom.
                      </p>
                    </form>
                  ) : (
                    <p className="text-xs text-stone-500 sm:text-right">
                      En attente de la confirmation de {beneficiary.name.split(" ")[0]} : le tour suivant
                      ne s&apos;ouvre qu&apos;après confirmation de la réception.
                    </p>
                  ))}
              </div>
            ) : (
              isOpen &&
              isTreasurer &&
              unpaid.length === 0 && (
                <form action={payout}>
                  <input type="hidden" name="tontine_id" value={t.id} />
                  <input type="hidden" name="cycle_id" value={cur.id} />
                  <input type="hidden" name="action" value="done" />
                  <button className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700">
                    J&apos;ai versé le pot à {beneficiary.name.split(" ")[0]}
                  </button>
                </form>
              )
            )}
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-stone-500">
              <span>
                {paidIds.size} / {expected.length} cotisations reçues ({formatFcfa(encaisse)} encaissés)
              </span>
              <span>
                {expected.length > 0 ? Math.round((paidIds.size / expected.length) * 100) : 0} %
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{
                  width: `${
                    expected.length > 0 ? (paidIds.size / expected.length) * 100 : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Tableau des cotisations */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-400">
                  <th className="py-2 pr-3 font-semibold">Tour</th>
                  <th className="py-2 pr-3 font-semibold">Membre</th>
                  <th className="py-2 pr-3 font-semibold">Statut</th>
                  <th className="py-2 text-right font-semibold">
                    {isTreasurer ? "Action" : <span className="sr-only">Action</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const contribution = curContribs.find((c) => c.membership_id === m.id);
                  const shouldBePaying = expected.some((x) => x.id === m.id);
                  const canAct = isTreasurer && isOpen && shouldBePaying && !contribution;
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-stone-100 ${
                        m.id === me.id ? "bg-orange-50/60" : ""
                      } ${m.status === "parti" ? "opacity-60" : ""}`}
                    >
                      <td className="py-3 pr-3 font-mono text-stone-400">{m.position}</td>
                      <td className="py-3 pr-3">
                        <span className="font-semibold text-stone-800">{m.name}</span>
                        {m.id === me.id && <span className="ml-1 text-xs text-orange-700">(vous)</span>}
                        <br />
                        <a href={`tel:${m.phone}`} className="text-xs text-stone-400 hover:text-stone-600">
                          {m.phone.replace(/(\d{2})(?=\d)/g, "$1 ").trim()}
                        </a>
                      </td>
                      <td className="py-3 pr-3">
                        {contribution ? (
                          <span className="font-medium text-emerald-700">
                            Payé · {contribution.method}
                            <br />
                            <span className="text-xs text-stone-400">
                              {formatDate(contribution.paid_at)}
                            </span>
                          </span>
                        ) : m.status === "parti" ? (
                          <span className="text-stone-400">Parti · ne cotise plus</span>
                        ) : isLate(cur) ? (
                          <span className="font-semibold text-red-600">En retard</span>
                        ) : (
                          <span className="text-stone-500">En attente</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {isTreasurer && contribution ? (
                          <form action={unpay} className="inline">
                            <input type="hidden" name="tontine_id" value={t.id} />
                            <input type="hidden" name="cycle_id" value={cur.id} />
                            <input type="hidden" name="membership_id" value={m.id} />
                            <button
                              disabled={!isOpen}
                              className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-stone-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                            >
                              Annuler
                            </button>
                          </form>
                        ) : canAct ? (
                          <form action={pay} className="inline-flex items-center gap-2">
                            <input type="hidden" name="tontine_id" value={t.id} />
                            <input type="hidden" name="cycle_id" value={cur.id} />
                            <input type="hidden" name="membership_id" value={m.id} />
                            <select
                              name="method"
                              defaultValue="Wave"
                              className="rounded-lg border border-stone-300 px-2 py-1.5 text-xs text-stone-700"
                            >
                              {METHODS.map((method) => (
                                <option key={method} value={method}>
                                  {method}
                                </option>
                              ))}
                            </select>
                            <button className="rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-700">
                              Valider
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rappels */}
          {isTreasurer && isOpen && unpaid.length > 0 && (
            <div className="mt-5 rounded-xl bg-stone-50 p-4">
              <p className="text-sm font-semibold text-stone-700">Rappels WhatsApp</p>
              <p className="mt-0.5 mb-2 text-xs text-stone-500">
                En plus de ces liens, les membres ayant activé les notifications 🔔 reçoivent un rappel
                automatique à J-2, le jour de l&apos;échéance et en cas de retard — sans rien faire de votre
                côté.
              </p>
              <div className="flex flex-wrap gap-2">
                {unpaid.map((m) => (
                  <a
                    key={m.id}
                    href={`https://wa.me/225${m.phone}?text=${encodeURIComponent(
                      `Bonjour ${m.name} 👋 Rappel : ta cotisation de ${formatFcfa(
                        curAmount
                      )} pour la tontine "${t.name}" est due le ${formatDate(cur.due_date)}. Merci !`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    Rappeler {m.name.split(" ")[0]}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-stone-600">
          🎉 Tous les tours sont terminés. La tontine est complète !
        </section>
      )}

      {/* Départs et remboursements */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-stone-900">
          Départs et remboursements {refunds.length > 0 && `(${refunds.length})`}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Un membre qui part avant son tour récupère le capital qu&apos;il a versé. Le montant est calculé
          automatiquement ; vous pouvez l&apos;ajuster (pénalité, acompte) au moment du règlement.
        </p>

        {refunds.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">Aucun départ enregistré pour l&apos;instant.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {refunds.map((r) => (
              <li key={r.id} className="rounded-xl bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-stone-800">
                      {r.member.name}{" "}
                      <span className="text-xs font-normal text-stone-400">
                        parti(e) le {r.created_at ? formatDate(r.created_at) : "—"} · capital{" "}
                        {formatFcfa(r.amount)}
                      </span>
                    </p>
                    <p className="text-sm text-stone-500">
                      {r.status === "paye" ? (
                        <span className="font-semibold text-emerald-700">
                          Remboursé {formatFcfa(r.paid_amount ?? 0)} · {r.method}
                          {r.paid_at ? ` le ${formatDate(r.paid_at)}` : ""}
                        </span>
                      ) : (
                        <span className="font-semibold text-orange-700">À rembourser · {formatFcfa(r.amount)}</span>
                      )}
                      {r.note && <span className="block text-xs text-stone-400">Note : {r.note}</span>}
                    </p>
                  </div>
                  {isTreasurer && r.status === "attente" && (
                    <MarkRefundForm tontineId={t.id} refundId={r.id} defaultAmount={r.amount} />
                  )}
                </div>
                {isTreasurer && r.status === "paye" && (
                  <form action={unmarkRefundPaidAction} className="mt-2">
                    <input type="hidden" name="tontine_id" value={t.id} />
                    <input type="hidden" name="refund_id" value={r.id} />
                    <button className="text-xs font-semibold text-stone-400 underline hover:text-red-600">
                      Annuler le règlement
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Membres */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-stone-900">
            Membres ({activeCount} actif{activeCount > 1 ? "s" : ""} · {members.length - activeCount} parti
            {members.length - activeCount > 1 ? "s" : ""})
          </h2>
          <ul className="mt-3 space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-stone-800">
                  {m.position}. {m.name}
                  {m.id === me.id && <span className="ml-1 text-xs text-orange-700">(vous)</span>}
                  {m.status === "parti" && (
                    <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-500">
                      parti
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-stone-500">
                  <span
                    title={
                      pushStatus[m.id]
                        ? "Notifications push activées : rappel automatique à J-2, le jour de l'échéance et en cas de retard."
                        : "Pas encore de notifications : cette personne verra les rappels dans l'application."
                    }
                    className={pushStatus[m.id] ? "text-emerald-600" : "text-stone-400"}
                  >
                    {pushStatus[m.id] ? "🔔" : "🔕"}
                  </span>
                  {m.is_treasurer === 1 && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-700">
                      Trésorier
                    </span>
                  )}
                  {m.status !== "parti" ? "inscrit" : "parti"}
                </span>
                {isTreasurer && isOpen && m.status !== "parti" && m.is_treasurer !== 1 && (
                  <LeaveMemberForm tontineId={t.id} membershipId={m.id} name={m.name} />
                )}
              </li>
            ))}
          </ul>

          {isTreasurer && isOpen && (
            <div className="mt-5 border-t border-stone-100 pt-4">
              <h3 className="mb-2 text-sm font-bold text-stone-800">Ajouter un membre</h3>
              <AddMemberForm tontineId={t.id} />
            </div>
          )}
        </section>

        <div className="space-y-6">
          {/* Cotisation */}
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-stone-900">Cotisation</h2>
            <p className="mt-1 text-sm text-stone-500">
              Actuelle : <strong className="text-stone-800">{formatFcfa(t.amount)}</strong>
              {cur && (
                <>
                  {" "}
                  · tour en cours : <strong className="text-stone-800">{formatFcfa(curAmount)}</strong>
                </>
              )}
              . Une modification s&apos;applique <strong>à partir du tour suivant</strong> : le tour en cours
              garde son montant.
            </p>
            {isTreasurer && isOpen && <div className="mt-3"><ChangeAmountForm tontineId={t.id} current={t.amount} /></div>}
            {changes.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-stone-500">
                {changes.map((c, i) => (
                  <li key={i}>
                    {formatFcfa(c.old_amount)} → <strong>{formatFcfa(c.new_amount)}</strong> à partir du tour{" "}
                    n°{c.from_cycle} · {formatDate(c.created_at)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Clôture */}
          {isTreasurer && isOpen && (
            <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 sm:p-6">
              <h2 className="text-lg font-bold text-red-800">Clôturer la tontine</h2>
              <p className="mt-1 text-sm text-stone-600">
                Action définitive : les tours restants sont annulés, plus aucune cotisation ni départ. Reste à
                régler :{" "}
                <strong>
                  {pendingRefunds.length} remboursement{pendingRefunds.length > 1 ? "s" : ""}
                </strong>
                {pendingRefunds.length > 0 && " (à solder avant de clôturer)"},{" "}
                {unpaid.length} cotisation{unpaid.length > 1 ? "s" : ""} en attente sur ce tour.
              </p>
              <div className="mt-3">
                <CloseTontineForm tontineId={t.id} name={t.name} pending={pendingRefunds.length} />
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Historique des cotisations : filtres membre + tour */}
      <section
        id="mon-historique"
        className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2 className="text-lg font-bold text-stone-900">Historique des cotisations</h2>
        <p className="mt-1 text-sm text-stone-500">
          Par défaut, vos propres paiements. Changez de membre pour voir ceux des autres
          (le montant est le même pour tout le monde) et de tour pour cibler un tour précis :
          chaque ligne a été validée par le trésorier, avec le mode et la date.
        </p>
        {oweNow && cur && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            ⏳ Votre cotisation du tour n°{cur.idx} est encore attendue — échéance du{" "}
            {formatDate(cur.due_date)}.
          </p>
        )}
        <div className="mt-4">
          <CotisationsHistory
            rows={historyRows}
            members={members.map((m) => ({ id: m.id, name: m.name, status: m.status }))}
            tours={cycles.map((c) => c.idx)}
            meId={me.id}
          />
        </div>
      </section>

      {/* Export CSV */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Exporter les données (CSV)</h2>
            <p className="mt-1 text-sm text-stone-500">
              Fichiers compatibles Excel et Google Sheets (séparateur « ; », accents conservés).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/tontines/${t.id}/export?type=cotisations`}
              download
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-orange-500 hover:text-orange-700"
            >
              ⬇ Cotisations (CSV)
            </a>
            <a
              href={`/tontines/${t.id}/export?type=audit`}
              download
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-orange-500 hover:text-orange-700"
            >
              ⬇ Journal d&apos;audit (CSV)
            </a>
            <a
              href={`/tontines/${t.id}/export?type=membres`}
              download
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-orange-500 hover:text-orange-700"
            >
              ⬇ Membres (CSV)
            </a>
            <a
              href={`/tontines/${t.id}/export?type=remboursements`}
              download
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-orange-500 hover:text-orange-700"
            >
              ⬇ Remboursements (CSV)
            </a>
          </div>
        </div>
      </section>

      {/* Journal d'audit */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-stone-900">Journal d&apos;audit</h2>
        <p className="mt-1 text-sm text-stone-500">
          Qui a validé quoi, quand et avec quel mode de paiement — cotisations, remboursements,
          versements du pot et clôture. 50 dernières opérations.
        </p>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-stone-400">Aucune opération enregistrée pour l&apos;instant.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {audit.map((e) => (
              <li key={e.id} className="rounded-lg bg-stone-50 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-stone-800">
                    {AUDIT_LABELS[e.action as AuditAction] ?? e.action}
                    {e.target && <span className="font-normal text-stone-500"> · {e.target}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {formatDate(e.created_at)} à {e.created_at.slice(11, 16)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                  <span className="font-medium text-stone-600">
                    Par {e.actor_name ?? "compte supprimé"}
                    {e.actor_phone ? ` · ${e.actor_phone}` : ""}
                  </span>
                  {e.amount != null && <span>{formatFcfa(e.amount)}</span>}
                  {e.method && <span>Mode : {e.method}</span>}
                  {e.note && <span className="text-stone-400">{e.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historique */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-stone-900">Historique des tours</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">
            Aucun tour terminé pour l&apos;instant. Les tours validés apparaîtront ici.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((c) => {
              const b = members.find((m) => m.id === c.beneficiary_id);
              const cycleContribs = getCycleContributions(c.id);
              const collected = cycleContribs.reduce((s, x) => s + x.amount, 0);
              return (
                <li key={c.id} className="rounded-lg bg-stone-50 px-3 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-stone-800">
                      Tour n°{c.idx} — {b?.name ?? "?"}
                    </span>
                    <span className="text-xs text-stone-500">
                      {formatDate(c.due_date)} · {formatFcfa(cycleAmount(c, t))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
                    <span>
                      {cycleContribs.length} cotisations · encaissé {formatFcfa(collected)}
                    </span>
                    <span className="font-semibold text-emerald-700">
                      Versé{c.payout_at ? ` le ${formatDate(c.payout_at)}` : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-1 text-lg font-extrabold text-stone-900">{value}</p>
    </div>
  );
}
