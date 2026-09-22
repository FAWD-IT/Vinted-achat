import fs from "node:fs";
import path from "node:path";
import {
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { AppConfig } from "../config.js";
import { log } from "../util.js";
import {
  isVintedSessionBlocked,
  launchBrowser,
  VintedSessionBlockedError,
} from "./launchBrowser.js";

export async function createContext(
  config: AppConfig,
  authStatePath: string,
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!fs.existsSync(authStatePath)) {
    throw new Error(
      `Session absente (${authStatePath}). Lancez : npm run login`,
    );
  }

  const browser = await launchBrowser(config);

  const context = await browser.newContext({
    storageState: authStatePath,
    locale: `${config.vinted.locale}-FR`,
    timezoneId: "Europe/Paris",
  });

  context.setDefaultTimeout(30_000);
  const page = await context.newPage();

  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

  return { browser, context, page };
}

export async function acceptCookiesIfPresent(page: Page): Promise<void> {
  const accept = page.getByRole("button", {
    name: /accepter tout|accept all/i,
  });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click().catch(() => {});
  }
}

export async function fetchItemHtml(
  page: Page,
  itemUrl: string,
): Promise<string> {
  const response = await page.goto(itemUrl, {
    waitUntil: "domcontentloaded",
  });
  await acceptCookiesIfPresent(page);
  if (!response?.ok()) {
    log("warn", `Chargement HTTP ${response?.status() ?? "?"} — nouvel essai…`);
  }
  const html = await page.content();
  if (isVintedSessionBlocked(html)) {
    throw new VintedSessionBlockedError();
  }
  return html;
}

export async function ensureDataDir(authStatePath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(authStatePath), { recursive: true });
}
