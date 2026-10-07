import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthForm } from "@/components/forms";

export default async function LoginPage() {
  if (await getUser()) redirect("/tontines");

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-stone-900">Connexion</h1>
        <p className="mt-1 mb-6 text-sm text-stone-500">Entrez votre numéro et votre code secret.</p>
        <AuthForm mode="login" />
      </div>
      <p className="mt-4 text-center text-sm text-stone-600">
        Pas encore de compte ?{" "}
        <Link href="/register" className="font-semibold text-orange-700 underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
