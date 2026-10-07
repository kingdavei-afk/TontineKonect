/** Constantes partagées client/serveur (aucune dépendance base de données). */

export const METHODS = ["Wave", "Orange Money", "MTN MoMo", "Moov Money", "Espèces"];

/* Formats utilisés aussi par les composants client (lib/tontine.ts les réexporte). */

export function formatFcfa(n: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(n)} F`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
