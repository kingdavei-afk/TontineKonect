import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Tontine Konect — Gérez votre tontine à Abidjan",
  description:
    "Créez votre tontine, suivez les cotisations des membres, l'ordre des tours et les rappels WhatsApp. Simple, fiable, pensé pour Abidjan.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tontine Konect", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#ea580c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-stone-500 sm:px-6">
            Tontine Konect — MVP pour les tontines d&apos;Abidjan. Les paiements (Wave, Orange Money, espèces)
            sont déclarés manuellement par le trésorier.
          </div>
        </footer>
        <PwaRegister />
      </body>
    </html>
  );
}
