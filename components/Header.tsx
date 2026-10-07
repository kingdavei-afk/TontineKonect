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
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-600 text-sm font-bold text-white">
            TK
          </span>
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
