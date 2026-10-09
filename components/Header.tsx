import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getVapidPublicKey } from "@/lib/reminders";
import { logout } from "@/app/actions";
import { PushToggle } from "@/components/PushToggle";

export async function Header() {
  const user = await getUser();

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={user ? "/tontines" : "/"} className="flex items-center gap-2">
          <svg className="h-8 w-8 shrink-0 rounded-lg bg-orange-100" width="48" height="48" viewBox="0 0 512 512" role="img" aria-label="Tontine Konect — Le Cercle">
            <title>Tontine Konect — Le Cercle</title>
            <defs>
              <linearGradient id="h-bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#f97316"/>
                <stop offset="1" stop-color="#ea580c"/>
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="112" fill="url(#h-bg)"/>
            <path d="M321.7 132.4 A140 140 0 1 1 190.3 132.4" fill="none" stroke="#ffffff" stroke-width="44" stroke-linecap="round"/>
            <circle cx="256" cy="116" r="34" fill="#fdba74"/>
          </svg>
          <span className="text-lg font-extrabold tracking-tight text-stone-900">
            Tontine <span className="text-orange-600">Konect</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link
                href="/tontines"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Mes tontines
              </Link>
              <Link
                href="/guide-tontinekonect.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Guide TontineKonect
              </Link>
              <PushToggle publicKey={getVapidPublicKey()} />
              <span className="hidden text-sm text-stone-500 sm:inline">{user.name}</span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-600 transition hover:border-stone-400"
                >
                  Déconnexion
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
              >
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
