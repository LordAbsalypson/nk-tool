/**
 * Erstellt die Screenshots für docs/TUTORIAL.md — führt den kompletten Weg
 * "leere App -> erste Abrechnung" tatsächlich in der UI durch (kein reiner
 * Datensatz-Dump wie backend/seed_demo.py für die README-Screenshots),
 * damit jeder Schritt wirklich zeigt, wie man dahin klickt.
 *
 * Voraussetzung: Backend läuft auf Port 8000 gegen eine LEERE, separate DB
 * (niemals nk_tool.db/nk_tool_test.db!) und Frontend-Dev-Server auf 5173.
 *
 * Aufruf: npx tsx scripts/tutorial-screenshots.ts
 */
import { chromium, type Page, type Locator } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", "docs", "tutorial");
const BASE_URL = "http://localhost:5173";

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, name: string) {
  await page.waitForTimeout(300); // Reactquery-Refetch/Transition abwarten
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`  -> ${name}.png`);
}

/** Findet zu einem sichtbaren Label-Text das direkt danach folgende Input/Select
 *  (das Projekt verknüpft <label> nicht per htmlFor/id, aber <label> und
 *  <input>/<select> sind im JSX immer direkte Geschwister-Elemente). */
function fieldFor(scope: Page | Locator, labelText: string) {
  return scope
    .locator(`label:text-is("${labelText}") + input, label:text-is("${labelText}") + select`)
    .first();
}

function dialog(page: Page): Locator {
  return page.getByRole("dialog");
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log("1) Start — leere App");
  await page.goto(BASE_URL);
  await page.waitForSelector("text=Keine Liegenschaft ausgewählt");
  await shot(page, "01_start_leer");

  console.log("2) Liegenschaft anlegen");
  await page.getByRole("button", { name: /Liegenschaft anlegen/i }).first().click();
  await dialog(page).waitFor();
  await fieldFor(dialog(page), "Name / Bezeichnung").fill("Musterstraße 12");
  await fieldFor(dialog(page), "Adresse").fill("Musterstraße 12");
  await fieldFor(dialog(page), "PLZ").fill("97070");
  await fieldFor(dialog(page), "Ort").fill("Würzburg");
  await shot(page, "02_liegenschaft_formular");
  await dialog(page).getByRole("button", { name: "Speichern" }).click();
  await page.waitForSelector("text=Wohnungen & Mieter");
  await shot(page, "03_liegenschaft_angelegt");

  console.log("3) Wohnungs-Assistent — Schritt 1: Wohnung");
  await page.getByRole("button", { name: "Wohnungen & Mieter", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Wohnung.*anlegen/i }).click();
  await dialog(page).waitFor();
  await fieldFor(dialog(page), "Wie heißt die Wohnung?").fill("Whg 1");
  await fieldFor(dialog(page), "Wie groß ist sie? (m²)").fill("52");
  await shot(page, "04_assistent_wohnung");
  await dialog(page).getByRole("button", { name: "Weiter" }).click();

  console.log("   Schritt 2: Mieter");
  await dialog(page).waitFor();
  await fieldFor(dialog(page), "Name des Mieters").fill("Familie Beispiel");
  await fieldFor(dialog(page), "Seit wann wohnt er/sie da?").fill("2024-01-01");
  await fieldFor(dialog(page), "Monatliche Vorauszahlung (€)").fill("140");
  await shot(page, "05_assistent_mieter");
  await dialog(page).getByRole("button", { name: "Weiter" }).click();

  console.log("   Schritt 3: Zähler");
  await dialog(page).waitFor();
  await shot(page, "06_assistent_zaehler");
  await dialog(page).getByRole("button", { name: /Wohnung anlegen/ }).click();
  await page.waitForTimeout(500);
  await shot(page, "07_wohnung_angelegt");

  console.log("4) Periode anlegen");
  await page.getByRole("button", { name: "Perioden", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Neue Periode/i }).click();
  await page.waitForSelector('label:text-is("Bezeichnung")');
  await fieldFor(page, "Bezeichnung").fill("01.06.2025 – 31.05.2026");
  await fieldFor(page, "Von").fill("2025-06-01");
  await fieldFor(page, "Bis").fill("2026-05-31");
  await shot(page, "08_periode_formular");
  await page.getByRole("button", { name: "Erstellen" }).click();
  await page.waitForTimeout(500);
  await shot(page, "09_periode_angelegt");

  console.log("5) Kostenart anlegen (Live-Ansicht)");
  await page.getByRole("button", { name: "2 · Kostenarten" }).click();
  await page.waitForTimeout(500);
  await shot(page, "10_kostenarten_leer");
  await page.getByRole("button", { name: /Neue Kostenart/i }).click();
  await page.waitForSelector('label:text-is("Name")');
  await fieldFor(page, "Name").fill("Grundsteuer");
  await shot(page, "11_kostenart_formular");
  await page.getByRole("button", { name: "Anlegen", exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="—"]').first().fill("2.10");
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await page.waitForTimeout(500);
  await shot(page, "12_kostenart_angelegt");

  console.log("6) Zählerstände-Ansicht");
  await page.getByRole("button", { name: "3 · Zählerstände" }).click();
  await page.waitForTimeout(500);
  await shot(page, "13_zaehlerstaende");

  console.log("7) Vorauszahlungen-Ansicht");
  await page.getByRole("button", { name: "4 · Vorauszahlungen" }).click();
  await page.waitForTimeout(500);
  await shot(page, "14_vorauszahlungen");

  console.log("8) Abrechnung-Ansicht");
  await page.getByRole("button", { name: "5 · Abrechnung" }).click();
  await page.waitForTimeout(500);
  await shot(page, "15_abrechnung");

  await browser.close();
  console.log("Fertig:", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
