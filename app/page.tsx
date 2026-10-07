import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/tontines");

  return (
    <div className="space-y-14">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 px-6 py-14 text-white sm:px-12 sm:py-20">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-orange-100">
          Abidjan · Côte d&apos;Ivoire
        </p>
        <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Votre tontine, enfin bien organisée.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-orange-50">
          Créez votre tontine, invitez les membres par un code, suivez qui a payé, qui doit, et à qui revient
          le pot à chaque tour. Fini les groupes WhatsApp et les cahiers perdus.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-white px-6 py-3 font-semibold text-orange-700 shadow-lg transition hover:bg-orange-50"
          >
            Créer ma tontine
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-white/70 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-3">
        {[
          {
            t: "Cotisations suivies",
            d: "Le trésorier déclare chaque paiement (Wave, Orange Money, MTN, Moov ou espèces) et tout le monde voit l'état en temps réel.",
          },
          {
            t: "Ordre des tours clair",
            d: "Chaque membre a son tour de bénéficiaire, avec la date d'échéance et le montant exact du pot.",
          },
          {
            t: "Rappels WhatsApp",
            d: "Un clic pour envoyer un rappel poli aux retardataires, directement dans WhatsApp.",
          },
        ].map((f) => (
          <div key={f.t} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-stone-900">{f.t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.d}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-stone-900">Comment ça marche</h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            ["1. Créez votre compte", "Votre numéro de téléphone + un code secret. Pas d'email requis."],
            ["2. Créez la tontine", "Montant, fréquence, date de début : vous recevez un code d'invitation."],
            ["3. Invitez et cotisez", "Les membres rejoignent avec le code, le trésorier enregistre chaque paiement."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl bg-stone-50 p-4">
              <p className="font-semibold text-orange-700">{t}</p>
              <p className="mt-1 text-sm text-stone-600">{d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
