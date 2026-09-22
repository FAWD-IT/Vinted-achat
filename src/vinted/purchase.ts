import type { Page } from "playwright";
import { log, parsePriceEur } from "../util.js";
import type { ItemPageSnapshot } from "./itemPageState.js";

import { advanceCheckoutBeforePayment } from "./checkout.js";

export type PurchaseAttemptResult =
  | { status: "completed" }
  | { status: "clicked"; checkoutUrl: string | null; checkout?: string }
  | { status: "blocked"; reason: string }
  | { status: "skipped"; reason: string };

async function readDisplayedPrice(page: Page): Promise<number | null> {
  const priceLocator = page.locator('[data-testid="item-price"], .web_ui__Text__text').filter({
    hasText: /€/,
  });
  const text = await priceLocator.first().textContent().catch(() => null);
  if (!text) return null;
  return parsePriceEur(text);
}

export type PurchaseOptions = {
  enablePurchase: boolean;
  maxPriceEur: number | null | undefined;
  advanceCheckout?: boolean;
  clickPay?: boolean;
  preferredRelaySubstring?: string | null;
  phone?: string | null;
};

function mapCheckoutProgress(
  progress: Awaited<ReturnType<typeof advanceCheckoutBeforePayment>>,
): PurchaseAttemptResult {
  if (progress.step === "blocked") {
    return { status: "blocked", reason: progress.reason };
  }
  if (progress.step === "relay_required") {
    return {
      status: "blocked",
      reason: "Point relais non sélectionné — vérifie preferred_relay_substring",
    };
  }
  if (progress.step === "payment_confirmed") {
    return { status: "completed" };
  }
  return { status: "clicked", checkoutUrl: null };
}

export async function attemptCheckoutOnly(
  page: Page,
  options: PurchaseOptions,
): Promise<PurchaseAttemptResult> {
  if (!options.enablePurchase) {
    return {
      status: "skipped",
      reason: "ENABLE_PURCHASE / safety.enable_purchase est désactivé",
    };
  }
  if (!page.url().includes("/checkout")) {
    return { status: "blocked", reason: "Pas sur la page checkout" };
  }
  log("info", "Finalisation checkout (relais + paiement)…");
  const progress = await advanceCheckoutBeforePayment(page, {
    clickPay: options.clickPay ?? false,
    preferredRelaySubstring: options.preferredRelaySubstring,
    phone: options.phone,
  });
  return mapCheckoutProgress(progress);
}

export async function attemptPurchase(
  page: Page,
  snapshot: ItemPageSnapshot,
  options: PurchaseOptions,
): Promise<PurchaseAttemptResult> {
  if (page.url().includes("/checkout")) {
    return attemptCheckoutOnly(page, options);
  }
  if (!options.enablePurchase) {
    return {
      status: "skipped",
      reason: "ENABLE_PURCHASE / safety.enable_purchase est désactivé",
    };
  }

  const maxPrice = options.maxPriceEur ?? null;
  if (maxPrice !== null) {
    const fromHtml = snapshot.priceText
      ? parsePriceEur(snapshot.priceText)
      : null;
    const fromDom = await readDisplayedPrice(page);
    const price = fromDom ?? fromHtml;
    if (price === null) {
      return { status: "blocked", reason: "Prix illisible — achat annulé" };
    }
    if (price > maxPrice) {
      return {
        status: "blocked",
        reason: `Prix ${price} € > plafond ${maxPrice} €`,
      };
    }
  }

  const buyButton = page.getByRole("button", { name: /^acheter$/i });
  const visible = await buyButton.isVisible().catch(() => false);
  if (!visible) {
    return {
      status: "blocked",
      reason: "Bouton Acheter absent ou compte à rebours actif",
    };
  }

  const disabled = await buyButton.isDisabled().catch(() => true);
  if (disabled) {
    return { status: "blocked", reason: "Bouton Acheter désactivé" };
  }

  log("info", "Clic sur Acheter…");
  await Promise.all([
    page.waitForURL(/\/checkout/, { timeout: 45_000 }),
    buyButton.click({ timeout: 10_000 }),
  ]).catch(async () => {
    await buyButton.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForURL(/\/checkout/, { timeout: 45_000 }).catch(() => {});
  });

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  let checkoutUrl = page.url().includes("checkout") ? page.url() : null;
  if (!checkoutUrl) {
    checkoutUrl = (await waitForCheckoutRedirect(page)) ?? null;
  }

  if (options.advanceCheckout) {
    if (!checkoutUrl) {
      return {
        status: "blocked",
        reason: "Checkout non atteint après clic Acheter (timeout)",
      };
    }
    const progress = await advanceCheckoutBeforePayment(page, {
      clickPay: options.clickPay ?? false,
      preferredRelaySubstring: options.preferredRelaySubstring,
      phone: options.phone,
    });
    const mapped = mapCheckoutProgress(progress);
    if (mapped.status !== "clicked") return mapped;
  }

  if (checkoutUrl) {
    log("info", `Checkout ouvert : ${checkoutUrl}`);
  } else {
    log(
      "info",
      "Étape suivante : finalisez le paiement manuellement (3-D Secure).",
    );
  }

  return { status: "clicked", checkoutUrl };
}

async function waitForCheckoutRedirect(page: Page): Promise<string | null> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (page.url().includes("/checkout")) return page.url();
    await page.waitForTimeout(200);
  }
  return null;
}
