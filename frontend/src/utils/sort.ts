/** Sortier-Helfer für Wohnungen.
 *
 * Wohnungen heißen "Whg 1" … "Whg 10". Ein reiner String-Vergleich sortiert
 * "Whg 10" vor "Whg 2" — deshalb wird für die Reihenfolge immer die Zahl aus
 * der Bezeichnung verwendet.
 */

export function whgNummer(bezeichnung: string | null | undefined): number {
  const m = (bezeichnung ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

/** Sortiert eine Liste von Objekten mit `bezeichnung` aufsteigend nach Wohnungsnummer. */
export function nachWohnungsnummer<T extends { bezeichnung: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => whgNummer(a.bezeichnung) - whgNummer(b.bezeichnung));
}
