/** ISO-Datum ("2025-06-01") als deutsches Datum ("01.06.2025"). Unbekannte
 *  Formate werden unverändert zurückgegeben statt "Invalid Date" zu zeigen. */
export function fmtDatumDe(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
