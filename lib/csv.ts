/**
 * Export CSV pensé pour Excel / Google Sheets en français :
 * séparateur « ; » (la virgule est le séparateur décimal), BOM UTF-8 pour les
 * accents, lignes CRLF.
 */

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function parse(iso: string | null | undefined): { d: string; time: string } | null {
  if (!iso) return null;
  const date = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = /^\d{2}:\d{2}/.test(iso.slice(11)) ? iso.slice(11, 16) : "";
  return { d: date, time };
}

/** "2026-10-06" → "06/10/2026" */
export function frDate(iso: string | null | undefined): string {
  const p = parse(iso);
  if (!p) return iso ?? "";
  const [y, m, d] = p.d.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10-06 12:39:00" → "06/10/2026 12:39" */
export function frDateTime(iso: string | null | undefined): string {
  const p = parse(iso);
  if (!p) return iso ?? "";
  return p.time ? `${frDate(iso)} ${p.time}` : frDate(iso);
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Nom de fichier sûr pour l'en-tête Content-Disposition. */
export function csvFilename(label: string): string {
  const slug = slugify(label);
  return `${slug || "export"}.csv`;
}
