import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthForm } from "@/components/forms";

export default async function RegisterPage() {
  if (await getUser()) redirect("/tontines");

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-stone-900">Créer un compte</h1>
        <p className="mt-1 mb-6 text-sm text-stone-500">
          Votre numéro et un code secret de 4 à 6 chiffres. Pas d&apos;email nécessaire.
        </p>
        <AuthForm mode="register" />
      </div>
      <p className="mt-4 text-center text-sm text-stone-600">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-semibold text-orange-700 underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
