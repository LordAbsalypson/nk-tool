# LEGAL_NOTES.md — Rechtliche Risikoanalyse (Open-Source-Release)

> **Disclaimer**: Dies ist **keine Rechtsberatung**. Es handelt sich um eine strukturierte,
> technisch orientierte Risikoübersicht zur Vorbereitung eines Gesprächs mit einem Rechtsanwalt
> (empfohlen: Fachanwalt für Miet-/IT-Recht) vor der Veröffentlichung dieses Projekts als
> Open Source. Keine Aussage in diesem Dokument ersetzt anwaltliche Prüfung im Einzelfall.
> Stand: 2026-09-18. Autor: LordAbsalypson (Projektinhaber), Analyse erstellt mit KI-Unterstützung (Claude).

---

## 1. DSGVO / Datenschutz

**Befund Repo-Hygiene** (geprüft am 2026-09-18):
- `.gitignore` schließt `backend/*.db`, `backend/uploads/`, `backup_safe/`, `abrechnungen_pdf/` explizit aus.
- `git log --all --diff-filter=A -- '*.db' '*.sqlite' '*.sqlite3'` → **keine Treffer**: nie eine DB-Datei committed.
- `git log --all --diff-filter=A -- 'backend/uploads/*' 'backup_safe/*'` → **keine Treffer**.
- Ergebnis: Das Repo selbst enthält aktuell keine personenbezogenen Mieterdaten in der Git-History.
- Restrisiko: Kein automatisierter Schutz vor künftigem versehentlichem Commit (z. B. via `git add -A`).
  Empfehlung: Pre-commit-Hook oder CI-Check, der `*.db`, `uploads/**`, `backup_safe/**` blockt.

**Risiko für Endnutzer des Tools** (andere Vermieter, die es selbst hosten):
- Sie verarbeiten personenbezogene Daten ihrer Mieter (Namen, Verbrauchsdaten, Kontodaten ggf.
  in Freitextfeldern) → sie sind **Verantwortliche i.S.d. Art. 4 Nr. 7 DSGVO**, nicht der Tool-Autor.
- Es findet **keine Auftragsverarbeitung** durch den Autor statt (lokal gehostet, kein SaaS, kein
  Datenfluss zum Autor) — das ist datenschutzrechtlich der einfachste Fall, muss aber explizit
  im README/einer Datenschutz-Sektion klargestellt werden, sonst entsteht Erwartungshaltung.

**Einschätzung für dieses Projekt: niedrig**
(reiner Code-Release, keine echten Daten im Repo, kein Betrieb durch den Autor).

**🔴 Kritischer Nachtrag (gefunden 2026-09-18, nicht durch den ursprünglichen DB-Check erfasst):**
Im **privaten** Betriebs-Repo gibt es getrackte Markdown-Dateien (kein `.db`, kein Upload), die
im Klartext echte Mieternamen, die volle Adresse der Liegenschaften sowie konkrete
Vorauszahlungs-/Nachzahlungsbeträge enthalten. Das ist **personenbezogene Daten Dritter im
Klartext-Quellcode** — der `.gitignore`-Check auf `*.db`/`uploads/`/`backup_safe/` deckt diesen
Fall nicht ab, weil es sich um reguläre, absichtlich getrackte Dokumentationsdateien handelt.
Diese Dateien sind bewusst NICHT Teil dieses (öffentlichen) Repos — siehe
`scripts/sync-to-public.sh` Whitelist.

**Status: strukturell mitigiert (Update 2026-09-21).** `scripts/sync-to-public.sh` nutzt seit der
Session, in der dieser Fund gemacht wurde, eine explizite Whitelist (`--include`-Liste), die
`CLAUDE.md` und `NEBENKOSTEN_STATUS.md` NICHT enthält — der Sync-Mechanismus selbst kann diese
Dateien also gar nicht mehr ins öffentliche Repo übertragen, unabhängig davon, was ein Mensch
manuell vergisst. Ein `--exclude="*"`-Fallback am Ende der Whitelist (Zeile 74 des Skripts) fängt
zusätzlich jede neue, nicht explizit freigegebene Datei ab.

**Einschätzung für einen Public-Release: niedrig** (strukturell durch die Whitelist mitigiert,
solange `scripts/sync-to-public.sh` nicht verändert wird, ohne diesen Schutz zu erhalten).
Für das aktuelle **private** Repo ohnehin unkritisch (kein Dritt-Zugriff).

**Handlungsempfehlung vor JEDER Umstellung auf öffentlich:**
- `CLAUDE.md` und `NEBENKOSTEN_STATUS.md` vor Public-Release entweder (a) vollständig anonymisieren/
  aus der Historie entfernen (z. B. `git filter-repo`), oder (b) aus dem öffentlichen Branch/Repo
  komplett ausschließen und durch generische Versionen ersetzen. Eine reine Neu-Commit-Löschung
  reicht NICHT — alte Commits mit echten Namen bleiben in der Git-Historie einsehbar.
- Bis zur Klärung: Repo **privat lassen**, nicht auf "public" umstellen.
- Optional: `.gitignore`-Check als CI-Schritt (z. B. `git-secrets` oder einfacher Grep-Job in GitHub Actions).

---

## 2. Haftung für Berechnungsfehler

**Risiko:** Fehlerhafte Berechnung (HKVO §9, Gradtagzahlen, Kostenverteilung) kann zu falschen
Abrechnungen gegenüber Mietern führen → finanzieller Schaden, im schlimmsten Fall Rechtsstreit
zwischen Vermieter (Tool-Nutzer) und Mieter.

**Rechtliche Einordnung:**
- Übliche OSS-Lizenzen (MIT, Apache-2.0, AGPL-3.0) enthalten "AS IS"-Klauseln, die Gewährleistung
  und Haftung des Autors umfassend ausschließen — das ist Standard und in der OSS-Community anerkannt.
- **Warum das ggf. nicht allein reicht:**
  - Es gibt **keine Vertragsbeziehung** zwischen Tool-Autor und Endnutzer (Lizenzvergabe ist kein
    Kaufvertrag) — insofern greifen Verbraucherschutzvorschriften (§§ 305 ff. BGB AGB-Kontrolle)
    grundsätzlich nicht direkt gegen den Autor.
  - Der Tool-**Nutzer** ist der Vermieter, nicht der Mieter — der Mieter hat gegenüber dem Tool-Autor
    ohnehin keinen Anspruch, da kein Rechtsverhältnis besteht. Der Vermieter haftet dem Mieter
    gegenüber für die Richtigkeit seiner Abrechnung unabhängig vom eingesetzten Werkzeug.
  - Restrisiko liegt bei **grober Fahrlässigkeit oder Vorsatz**: Haftungsausschlüsse für grobe
    Fahrlässigkeit lassen sich nach deutschem Recht (§ 276 Abs. 3, § 309 Nr. 7 BGB) nicht wirksam
    ausschließen — bei unentgeltlicher OSS-Bereitstellung ohne kommerzielle Nähe ist dies praktisch
    ein sehr geringes Risiko, aber die Lizenz sollte den Ausschluss trotzdem sauber formulieren.

**Einschätzung für dieses Projekt: mittel**
(kein finanzielles Interesse des Autors, aber Software trifft reale Zahlungsentscheidungen Dritter —
höher als reines Utility-Tool, niedriger als kommerzielle Software mit Support-Vertrag).

**Handlungsempfehlung:**
- Explizite "NO WARRANTY"-Klausel in LICENSE (Standard bei MIT/Apache-2.0/AGPL bereits enthalten).
- Zusätzlicher Disclaimer im README: "Diese Software berechnet Nebenkosten nach bestem Wissen
  gemäß BetrKV/HKVO, ersetzt aber keine Prüfung durch den Nutzer. Der Nutzer bleibt für die
  Richtigkeit seiner Abrechnung gegenüber Mietern allein verantwortlich."
- Keine Formulierungen wie "rechtssicher", "geprüft", "garantiert korrekt" verwenden (siehe Punkt 3).

---

## 3. Rechtsdienstleistungsgesetz (RDG)

**Frage:** Ist automatisierte Berechnung nach BetrKV/HKVO eine "Rechtsdienstleistung" i.S.d. RDG?

**Grobe Einschätzung:**
- Reine **Rechenhilfe/Software**, die eine gesetzlich definierte Formel anwendet (wie ein
  Taschenrechner oder eine Excel-Vorlage), ist grundsätzlich **keine Rechtsdienstleistung** i.S.d.
  § 2 RDG — es fehlt die individuelle rechtliche Prüfung/Beratung im Einzelfall.
- Kritisch würde es, wenn das Tool **rechtliche Bewertungen** vornimmt oder suggeriert
  ("Diese Position ist umlagefähig", "Ihre Abrechnung ist rechtssicher") statt reiner Berechnung
  auf Basis von Nutzereingaben.

**Einschätzung für dieses Projekt: niedrig**
(reine Berechnungslogik, keine individuelle Rechtsberatung, keine Rechtsprüfung von Klauseln).

**Handlungsempfehlung:**
- Vorsicht bei Marketing-/README-Formulierungen: "rechtssicher", "anwaltlich geprüft", "garantiert
  BetrKV-konform" vermeiden. Stattdessen neutral: "berechnet nach den Vorgaben der BetrKV/HKVO"
  oder "implementiert die in [Quelle] beschriebene Berechnungslogik".
- Kein Feature einbauen, das automatisch rechtliche Zulässigkeit einzelner Kostenpositionen bewertet,
  ohne das klar als "unverbindliche Orientierung" zu kennzeichnen.

---

## 4. Urheberrecht / KI-generierter Code

**Rechtliche Einordnung (Deutschland, Stand 2026):**
- Rein KI-generierter Code ohne menschliche schöpferische Leistung ist nach deutschem Urheberrecht
  (§ 2 Abs. 2 UrhG, Schöpfungshöhe durch natürliche Person) **derzeit nicht abschließend geklärt**
  hinsichtlich Urheberrechtsschutz — UNVERIFIED, keine höchstrichterliche Entscheidung bekannt.
- **Praktisch unproblematisch für dieses Projekt**: Der menschliche Kurator (LordAbsalypson), der Anforderungen
  definiert, Architektur-Entscheidungen trifft, Code kuratiert/prüft und die Lizenzvergabe entscheidet,
  gilt regelmäßig als hinreichender kreativer Beitrag, um über das Gesamtwerk (Zusammenstellung,
  Struktur, Auswahl) Rechte zu halten und eine Lizenz zu vergeben — unabhängig von der ungeklärten
  Frage zu einzelnen KI-generierten Codefragmenten.
- Für Nutzer/Forker praktisch kein Unterschied: Die Lizenz (Punkt 6) regelt Nutzungsrechte am
  Gesamtwerk, wie es im Repo vorliegt.

**Einschätzung für dieses Projekt: niedrig**

**Handlungsempfehlung:**
- Im README transparent deklarieren, z. B.: "Idea, concept & architecture by [LordAbsalypson]. Code written
  with AI assistance (Claude)." — das reduziert Erwartungshaltung ("perfekter, handgeprüfter Code")
  und damit faktisch auch Haftungsrisiko, eher als es zu verschweigen.

---

## 5. Markenrecht

**Befund:** `CLAUDE.md` (nicht öffentlich, internes Kontext-Dokument) enthält die Formulierung
"Replaces the ista SE billing service" — Bezug auf die Marke **ista SE** (registrierter
Dienstleister für Heizkostenabrechnung).

**Risiko:** Wettbewerbsbezogene oder herabsetzende Nennung fremder Marken im öffentlichen
README/Marketing-Material kann marken- oder wettbewerbsrechtliche Ansprüche auslösen
(§ 14 MarkenG, § 6 UWG — vergleichende Werbung, Herabsetzung).

**Einschätzung für dieses Projekt: niedrig**
(interne Doku ist nicht Teil des öffentlichen Release-Textes; Risiko entsteht erst bei
öffentlicher Formulierung).

**Handlungsempfehlung:**
- Im öffentlichen README **keine Firmennamen wie "ista" nennen**. Neutral formulieren, z. B.:
  "Self-hosted alternative to commercial third-party billing services for German utility cost
  statements (Nebenkostenabrechnung)."
- Internes `CLAUDE.md` bleibt unverändert (nicht für Veröffentlichung bestimmt) — sofern es nicht
  versehentlich mit ins Repo/README übernommen wird. Kurzer Check vor Release empfohlen.

---

## 6. Lizenzwahl-Kurzempfehlung

| Lizenz | Haftungsausschluss | Attribution erzwungen | Netzwerk-Copyleft (SaaS-Fall) | Passt hier? |
|--------|--------------------|-----------------------|-------------------------------|-------------|
| MIT | Ja (Standard "AS IS") | Nein (nur Copyright-Notice) | Nein | Einfach, aber kein Schutz gegen SaaS-Fork ohne Attribution |
| Apache-2.0 | Ja + Patentklausel | Nein (nur Notice) | Nein | Etwas stärker als MIT (Patente), gleiches SaaS-Problem |
| **AGPL-3.0** | Ja | Ja (Quellcode-Offenlegung bei Nutzung) | **Ja** — wer das Tool als gehosteten Dienst anbietet, muss Quellcode offenlegen | **Empfohlen** |

**Begründung:** Das Projekt hat zwei relevante Eigenschaften — (a) Haftungsrisiko durch
finanziell relevante Berechnungen, (b) Wunsch nach Attribution und Verhinderung, dass jemand das
Tool unverändert als kommerziellen SaaS-Dienst anbietet, ohne Quellcode/Änderungen offenzulegen.
AGPL-3.0 erzwingt genau das über die "Network Use"-Klausel (§ 13 AGPL) — relevant, falls jemand
das Tool z. B. als gehostete Nebenkostenabrechnungs-Plattform für mehrere Vermieter anbietet.
MIT/Apache-2.0 würden das nicht verhindern.

**Trade-off:** AGPL schreckt manche kommerzielle Contributor/Integratoren ab (Copyleft-Pflicht) —
für ein privates/gemeinnütziges Nischentool (Vermieter-Community) ist das i. d. R. unkritisch.

**Einschätzung: AGPL-3.0 am besten geeignet.**

**Status: entschieden und umgesetzt (2026-09-21).** `LICENSE` enthält den vollständigen
AGPL-3.0-Text der FSF, README (DE+EN) wurde entsprechend angepasst. Der vormalige Widerspruch
zwischen `LICENSE` (PolyForm Noncommercial) und dieser Empfehlung ist damit aufgelöst.

---

## Zusammenfassung — Handlungsempfehlungen (priorisiert)

1. **Lizenz**: AGPL-3.0 als LICENSE-Datei hinzufügen. ✅ Erledigt (2026-09-21).
2. **README-Disclaimer**: Haftungsausschluss + "kein Rechtsdienstleister" + "Betreiber ist
   DSGVO-Verantwortlicher" als eigener Abschnitt.
3. **README-Formulierung**: Keine Konkurrenznennung ("ista"), keine Begriffe wie "rechtssicher"/
   "geprüft"/"garantiert".
4. **KI-Transparenz**: Kurzer Hinweis "idea & concept by [LordAbsalypson], code assisted by generative AI".
5. **CI-Absicherung**: Automatisierter Check gegen versehentliches Commit von `*.db`/`uploads/`/
   `backup_safe/` (zusätzlich zur bestehenden, aktuell sauberen `.gitignore`).
6. **Vor Veröffentlichung**: Anwaltliche Prüfung von LICENSE + README-Disclaimer-Text, insbesondere
   Haftungsausschluss-Formulierung (Punkt 2) und finaler ista-Neutralitäts-Check (Punkt 3).
   **ista-Neutralitäts-Check durchgeführt (2026-09-21):** `grep -i "ista\|techem"` über
   `README.md`, `FEATURES_ROADMAP.md`, `ARCHITECTURE.md`, `AI_COMMANDS.md` — einzige Treffer sind
   die 4 README-Stellen ("Ersatz für teure externe Abrechnungsdienste (z. B. ista)" DE+EN), jeweils
   rein vergleichend als Beispiel markiert ("z. B."), keine Herabsetzung. Keine Treffer für
   "rechtssicher"/"garantiert"/"geprüft" im README. Bleibt: anwaltliche Prüfung ersetzt dieser
   automatisierte Check nicht, nur die technische Vorprüfung ist damit abgeschlossen.

---

## Executive Summary (English)

This is a risk overview, not legal advice, for an open-source release of a self-hosted German
utility-cost billing tool (Nebenkostenabrechnung, BetrKV/HKVO §9). Git history check confirms no
real tenant data (DB, uploads, backups) was ever committed. Key findings: GDPR risk is low (no data
in repo, no processing by the author — operators are their own data controllers); liability risk
for calculation errors is medium (real financial impact on third parties, but no contract between
author and end user); the tool does not constitute a regulated legal service (RDG) as long as
marketing avoids terms like "legally guaranteed"; AI-assisted code authorship is not legally
settled in Germany but is practically unproblematic given human curation and license decisions;
the internal reference to "ista SE" must not appear in public materials (trademark/competition
law). **Top recommendation: license under AGPL-3.0** (not MIT/Apache) to enforce source disclosure
if someone hosts this as a SaaS product, combined with a clear liability/GDPR disclaimer in the
public README before release.
