import type { Browser, BrowserContext } from "playwright";
import type { AppConfig } from "../config.js";
import { log, sleep } from "../util.js";
import { waitForRevolutOrPaymentConfirmation } from "../vinted/checkout.js";
import type { PurchaseAttemptResult } from "../vinted/purchase.js";

let runCloseScheduled = false;

export type FinishRunOptions = {
  closeBrowser?: boolean;
};

export async function handlePurchaseResult(
  result: PurchaseAttemptResult,
  page: import("playwright").Page,
  config: AppConfig,
  browser: Browser,
  context: BrowserContext,
  options: FinishRunOptions = {},
): Promise<boolean> {
  const shouldClose = options.closeBrowser !== false;

  if (result.status === "completed") {
    log("info", "Commande passée — flux terminé avec succès.");
    if (shouldClose) {
      await closeBrowser(browser, context, config, 4_000);
    }
    return true;
  }

  if (result.status === "clicked") {
    if (config.safety.click_pay) {
      log("info", "Paiement lancé — confirmation en cours…");
      const ok = await waitForRevolutOrPaymentConfirmation(page);
      if (ok) {
        log("info", "Commande passée — flux terminé avec succès.");
        if (shouldClose) {
          await closeBrowser(browser, context, config, 4_000);
        }
        return true;
      }
      log(
        "warn",
        "Paiement peut-être OK (Revolut validé) mais confirmation Vinted non détectée.",
      );
      if (shouldClose) {
        await closeBrowser(browser, context, config, 8_000);
      }
      return true;
    }

    log("info", "Checkout prêt — arrêt avant Payer (click_pay désactivé).");
    if (shouldClose) {
      await closeBrowser(browser, context, config, 5_000);
    }
    return true;
  }

  return false;
}

export async function closeBrowser(
  browser: Browser,
  context: BrowserContext,
  config: AppConfig,
  delayMs: number,
): Promise<void> {
  if (runCloseScheduled) {
    return;
  }
  runCloseScheduled = true;

  if (!config.browser.headless) {
    log("info", `Fermeture du navigateur dans ${Math.round(delayMs / 1000)} s…`);
    await sleep(delayMs);
  }
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  log("info", "Bot arrêté.");
}
