import type { BrowserContext, Page } from "playwright";
import type { AppConfig } from "../config.js";
import { log, sleep } from "../util.js";
import { acceptCookiesIfPresent } from "../vinted/browser.js";
import { applyJitter } from "./smartWait.js";

/** Ouvre les onglets multi-annonces une seule fois, juste avant le tir (pas au démarrage). */
export async function openMultiItemPages(
  context: BrowserContext,
  clockPage: Page,
  itemUrls: string[],
  config: AppConfig,
): Promise<Page[]> {
  if (itemUrls.length <= 1) {
    return [clockPage];
  }

  log("info", `Préchargement de ${itemUrls.length} onglets (une passe, espacement aléatoire)…`);

  const pages: Page[] = [clockPage];
  for (let i = 1; i < itemUrls.length; i++) {
    const gap = applyJitter(config.snipe.multi_tab_open_gap_ms, 0.25);
    await sleep(gap);
    const page = await context.newPage();
    await page.goto(itemUrls[i], { waitUntil: "domcontentloaded" });
    await acceptCookiesIfPresent(page);
    pages.push(page);
  }

  if (config.snipe.preload_ms > 0) {
    await clockPage.goto(itemUrls[0], { waitUntil: "domcontentloaded" });
    await acceptCookiesIfPresent(clockPage);
  }

  return pages;
}
