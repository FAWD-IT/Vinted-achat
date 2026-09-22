import { loadConfig, resolveAuthStatePath } from "../config.js";
import { log } from "../util.js";
import { createContext } from "../vinted/browser.js";
import { attemptCheckoutOnly } from "../vinted/purchase.js";
import { handlePurchaseResult } from "../snipe/finishRun.js";

async function main(): Promise<void> {
  const checkoutUrl = process.env.CHECKOUT_URL?.trim();
  if (!checkoutUrl?.includes("/checkout")) {
    throw new Error(
      "Définissez CHECKOUT_URL dans .env (URL complète de la page Paiement Vinted).",
    );
  }

  const config = loadConfig();
  const { browser, context, page } = await createContext(
    config,
    resolveAuthStatePath(),
  );

  try {
    log("info", `Reprise checkout : ${checkoutUrl}`);
    await page.goto(checkoutUrl, { waitUntil: "domcontentloaded" });

    const result = await attemptCheckoutOnly(page, {
      enablePurchase: config.safety.enable_purchase,
      maxPriceEur: config.safety.max_price_eur,
      advanceCheckout: true,
      clickPay: config.safety.click_pay,
      preferredRelaySubstring:
        config.snipe.preferred_relay_substring || null,
      phone: config.buyer.phone || null,
    });

    if (result.status !== "clicked" && result.status !== "completed") {
      throw new Error(result.status === "blocked" ? result.reason : result.reason);
    }

    await handlePurchaseResult(result, page, config, browser, context);
  } finally {
    // fermeture gérée par handlePurchaseResult
  }
}

log("info", "Démarrage checkout (relais + Payer + attente Revolut)…");

main().catch((err) => {
  log("error", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
