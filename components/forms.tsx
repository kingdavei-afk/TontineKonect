"use client";

import { useActionState, useState } from "react";
import {
  addMemberManually,
  changeAmountAction,
  closeTontineAction,
  createTontine,
  joinTontine,
  leaveMemberAction,
  login,
  markRefundPaidAction,
  register,
  type FormState,
} from "@/app/actions";
import { METHODS } from "@/lib/constants";

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-200";
const btnCls =
  "inline-flex w-full items-center justify-center rounded-xl bg-orange-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60";
const labelCls = "mb-1.5 block text-sm font-medium text-stone-700";

function ErrorMsg({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {error}
    </p>
  );
}

/* ---------- Auth ---------- */

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? login : register;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {mode === "register" && (
        <div>
          <label className={labelCls} htmlFor="name">Nom complet</label>
          <input id="name" name="name" className={inputCls} placeholder="Ex. Aya Koné" autoComplete="name" required />
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor="phone">Numéro de téléphone</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          className={inputCls}
          placeholder="07 07 12 34 56"
          autoComplete="tel"
          required
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="pin">Code secret ({mode === "login" ? "4 à 6 chiffres" : "4 à 6 chiffres, à retenir"})</label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          maxLength={6}
          className={`${inputCls} tracking-[0.5em]`}
          placeholder="••••"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </div>
      <ErrorMsg error={state.error} />
      <button type="submit" className={btnCls} disabled={pending}>
        {pending ? "Veuillez patienter…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
      </button>
    </form>
  );
}

/* ---------- Tontines ---------- */

export function CreateTontineForm({ defaultDate }: { defaultDate: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createTontine, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="t-name">Nom de la tontine</label>
        <input id="t-name" name="name" className={inputCls} placeholder="Ex. Tontine du quartier" required />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="t-amount">Cotisation (FCFA)</label>
          <input
            id="t-amount"
            name="amount"
            type="number"
            min={500}
            step={500}
            defaultValue={5000}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="t-freq">Fréquence</label>
          <select id="t-freq" name="frequency" className={inputCls} defaultValue="hebdo">
            <option value="hebdo">Hebdomadaire (tous les 7 jours)</option>
            <option value="bimensuel">Tous les 15 jours</option>
            <option value="mensuel">Mensuelle</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="t-start">Date de la première cotisation</label>
        <input id="t-start" name="start_date" type="date" defaultValue={defaultDate} className={inputCls} required />
      </div>
      <ErrorMsg error={state.error} />
      <button type="submit" className={btnCls} disabled={pending}>
        {pending ? "Création…" : "Créer la tontine"}
      </button>
      <p className="text-xs text-stone-500">
        Vous devenez trésorier : c&apos;est vous qui encaissez les cotisations et marquez les versements.
      </p>
    </form>
  );
}

export function JoinTontineForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(joinTontine, {});

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row">
      <input
        name="code"
        className={`${inputCls} sm:flex-1 uppercase tracking-widest`}
        placeholder="CODE D'INVITATION"
        defaultValue={defaultCode}
        maxLength={6}
        required
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-xl border border-orange-600 px-5 py-3 font-semibold text-orange-700 transition hover:bg-orange-50 disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "…" : "Rejoindre"}
      </button>
      {state.error && <p className="text-sm text-red-600 sm:basis-full">{state.error}</p>}
    </form>
  );
}

export function AddMemberForm({ tontineId }: { tontineId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addMemberManually, {});
  const [edited, setEdited] = useState(false);
  // L'action serveur renvoie `ok: true` après un ajout réussi ;
  // `edited` réinitialise le bouton dès que l'on retouche le formulaire.
  const done = !pending && !!state.ok && !edited;

  return (
    <form action={formAction} className="space-y-3" onInput={() => setEdited(false)}>
      <input type="hidden" name="tontine_id" value={tontineId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input name="name" className={inputCls} placeholder="Nom du membre" required />
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          className={inputCls}
          placeholder="07 07 12 34 56"
          required
        />
      </div>
      <ErrorMsg error={state.error} />
      <button
        type="submit"
        disabled={pending || done}
        className="rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "Ajout…" : done ? "Membre ajouté ✓" : "Ajouter un membre"}
      </button>
      {done && (
        <p className="text-sm font-medium text-emerald-700">
          Membre ajouté ✓ — le champ est prêt pour le suivant.
        </p>
      )}
      <p className="text-xs text-stone-500">
        Si la personne a déjà un compte, son profil est lié automatiquement. Sinon, elle devra s&apos;inscrire
        avec ce numéro pour voir la tontine.
      </p>
    </form>
  );
}

/* ---------- Utilitaires ---------- */

/* ---------- Sortie d'argent ---------- */

const smallInput =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200";

function OkMsg({ state }: { state: FormState }) {
  if (!state.ok || !state.message) return null;
  return <p className="text-sm font-medium text-emerald-700">{state.message}</p>;
}

export function ChangeAmountForm({
  tontineId,
  current,
}: {
  tontineId: string;
  current: number;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changeAmountAction, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="tontine_id" value={tontineId} />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={labelCls} htmlFor="amount-change">
            Nouvelle cotisation (FCFA)
          </label>
          <input
            id="amount-change"
            name="amount"
            type="number"
            min={500}
            step={500}
            defaultValue={current}
            className={`${smallInput} w-40`}
            required
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
        >
          {pending ? "Application…" : "Appliquer"}
        </button>
      </div>
      <ErrorMsg error={state.error} />
      <OkMsg state={state} />
    </form>
  );
}

export function LeaveMemberForm({
  tontineId,
  membershipId,
  name,
}: {
  tontineId: string;
  membershipId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(leaveMemberAction, {});
  const [step, setStep] = useState<0 | 1>(0);

  return (
    <form
      action={(fd) => {
        setStep(0);
        return formAction(fd);
      }}
      className="w-full space-y-1"
    >
      <input type="hidden" name="tontine_id" value={tontineId} />
      <input type="hidden" name="membership_id" value={membershipId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {step === 0 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-stone-500 transition hover:border-red-300 hover:text-red-600"
          >
            Faire partir
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? "…" : `Confirmer le départ de ${name.split(" ")[0]}`}
            </button>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-xs font-semibold text-stone-400 underline hover:text-stone-600"
            >
              Annuler
            </button>
          </span>
        )}
        <span className="flex-1 text-right text-xs">
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.ok && state.message && <span className="text-emerald-700">{state.message}</span>}
        </span>
      </div>
    </form>
  );
}

export function MarkRefundForm({
  tontineId,
  refundId,
  defaultAmount,
}: {
  tontineId: string;
  refundId: string;
  defaultAmount: number;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    markRefundPaidAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="tontine_id" value={tontineId} />
      <input type="hidden" name="refund_id" value={refundId} />
      <div>
        <label className={labelCls} htmlFor={`refund-${refundId}`}>
          Montant versé
        </label>
        <input
          id={`refund-${refundId}`}
          name="amount"
          type="number"
          min={0}
          step={500}
          defaultValue={defaultAmount}
          className={`${smallInput} w-28`}
          required
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`method-${refundId}`}>
          Mode
        </label>
        <select id={`method-${refundId}`} name="method" className={smallInput} defaultValue="Wave">
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "…" : "Marquer remboursé"}
      </button>
      <div className="w-full">
        <ErrorMsg error={state.error} />
      </div>
    </form>
  );
}

export function CloseTontineForm({
  tontineId,
  name,
  pending,
}: {
  tontineId: string;
  name: string;
  pending: number;
}) {
  const [state, formAction, pendingAction] = useActionState<FormState, FormData>(
    closeTontineAction,
    {}
  );
  const [step, setStep] = useState<0 | 1>(0);

  return (
    <form
      action={(fd) => {
        setStep(0);
        return formAction(fd);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="tontine_id" value={tontineId} />
      {pending > 0 && (
        <p className="text-sm font-semibold text-red-700">
          ⚠️ {pending} remboursement{pending > 1 ? "s" : ""} restent encore à régler.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {step === 0 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            Clôturer la tontine…
          </button>
        ) : (
          <>
            <button
              type="submit"
              disabled={pendingAction}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {pendingAction
                ? "Clôture…"
                : `Confirmer la clôture de « ${name} »`}
            </button>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-sm font-semibold text-stone-500 underline"
            >
              Annuler
            </button>
          </>
        )}
      </div>
      <ErrorMsg error={state.error} />
      <OkMsg state={state} />
    </form>
  );
}

/* ---------- Utilitaires ---------- */

export function CopyButton({ text, label = "Copier le code" }: { text: string; label?: string }) {  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard indisponible */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-orange-500 hover:text-orange-700"
    >
      {copied ? "Copié ✓" : label}
    </button>
  );
}
