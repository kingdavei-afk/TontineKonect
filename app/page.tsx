import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

const AVATAR_H = "/avatars/homme.svg";
const AVATAR_F = "/avatars/femme.svg";

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

        {/* visuels de communauté */}
        <div className="mt-10 flex items-center justify-center gap-8 sm:gap-14">
          <img
            src={AVATAR_H}
            alt=""
            className="h-20 w-20 rounded-full shadow-lg"
          />
          <img
            src={AVATAR_F}
            alt=""
            className="h-20 w-20 rounded-full shadow-lg"
          />
          <div className="flex gap-3" aria-hidden="true">
            <span className="h-6 w-6 animate-pulse rounded-full bg-orange-200" />
            <span className="h-6 w-6 animate-pulse rounded-full bg-orange-300" style={{ animationDelay: "0.2s" }} />
            <span className="h-6 w-6 animate-pulse rounded-full bg-orange-400" style={{ animationDelay: "0.4s" }} />
          </div>
          <img
            src={AVATAR_H}
            alt=""
            className="h-20 w-20 rounded-full shadow-lg"
          />
          <img
            src={AVATAR_F}
            alt=""
            className="h-20 w-20 rounded-full shadow-lg"
          />
        </div>
      </section>

      {/* témoignages */}
      <section className="space-y-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">Ils utilisent déjà Tontine Konect</p>
          <h2 className="mt-2 text-2xl font-bold text-stone-900">Des voisins, des famille, des amis qui organisent leur épargne.</h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* témoignage 1 — femme */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <img
                src={AVATAR_F}
                alt=""
                className="h-12 w-12 rounded-full"
              />
              <div>
                <p className="font-bold text-stone-900">Adèle Kouassi</p>
                <p className="text-xs text-stone-500">Membre, Tontine des voisines</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-stone-600">
              &ldquo;Avant, on se le demandait à chaque fois qui a payé, qui doit. Maintenant le trésorier valide et
              tout le monde voit sur son téléphone. Je ne me fatigue plus à envoyer des messages WhatsApp.&rdquo;
            </p>
            <div className="mt-4 flex items-center gap-1 text-amber-500" aria-label="5 étoiles">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 1l2.39 4.84 5.34.81-3.87 3.77.91 5.33L10 13.27l-4.77 2.51.91-5.33L2.28 6.65l5.34-.81L10 1z" />
                </svg>
              ))}
            </div>
          </div>

          {/* témoignage 2 — homme */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <img
                src={AVATAR_H}
                alt=""
                className="h-12 w-12 rounded-full"
              />
              <div>
                <p className="font-bold text-stone-900">M. Jean-Baptiste Yao</p>
                <p className="text-xs text-stone-500">Trésorier, Tontine famille</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-stone-600">
              &ldquo;Je suis trésorier d’une tontine de 6 personnes. Avec l&rsquo;appli je valide chaque paiement en 2
              secondes, je vois qui est en retard, et j&rsquo;envoie un rappel WhatsApp poli sans avoir à tout
              recopier à la main.&rdquo;
            </p>
            <div className="mt-4 flex items-center gap-1 text-amber-500" aria-label="5 étoiles">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 1l2.39 4.84 5.34.81-3.87 3.77.91 5.33L10 13.27l-4.77 2.51.91-5.33L2.28 6.65l5.34-.81L10 1z" />
                </svg>
              ))}
            </div>
          </div>

          {/* témoignage 3 — femme (encore une femme + homme = respect de la demande : au moins 1homme 1dame déjà acquis) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <img
                src={AVATAR_F}
                alt=""
                className="h-12 w-12 rounded-full"
              />
              <div>
                <p className="font-bold text-stone-900">Fatou Bamba</p>
                <p className="text-xs text-stone-500">Bénéficiaire, Tontine voisins Nord</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-stone-600">
              &ldquo;La tontine m&rsquo;a permis de commencer un petit commerce. Je savais chaque jour où j&rsquo;en étais,
              et le jour J le pot m&rsquo;a bien été versé. Tout a été clair et calme.&rdquo;
            </p>
            <div className="mt-4 flex items-center gap-1 text-amber-500" aria-label="5 étoiles">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className="h-4 w-4 fill-current" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 1l2.39 4.84 5.34.81-3.87 3.77.91 5.33L10 13.27l-4.77 2.51.91-5.33L2.28 6.65l5.34-.81L10 1z" />
                </svg>
              ))}
            </div>
          </div>
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
