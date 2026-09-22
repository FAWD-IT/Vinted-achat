import type { Browser, BrowserContext, Page } from "playwright";
import type { AppConfig } from "../config.js";
import { log, sleep } from "../util.js";
import {
  acceptCookiesIfPresent,
  fetchItemHtml,
} from "../vinted/browser.js";
import {
  countdownEndMs,
  isPurchaseWindowOpen,
  parseItemPageSnapshot,
} from "../vinted/itemPageState.js";
import { attemptCheckoutOnly, attemptPurchase } from "../vinted/purchase.js";
import type { PurchaseOptions } from "../vinted/purchase.js";
import { handlePurchaseResult } from "./finishRun.js";
import {
  adaptivePollIntervalMs,
  applyJitter,
  clockSleepBeforePollingMs,
  logWaitPlan,
} from "./smartWait.js";

export async function burstPurchaseLoop(
  page: Page,
  itemUrl: string,
  label: string,
  config: AppConfig,
  purchaseOptions: PurchaseOptions,
  browser: Browser,
  context: BrowserContext,
  burstUntil: number,
  closeOnSuccess: boolean,
): Promise<boolean> {
  const finishOpts = { closeBrowser: closeOnSuccess };
  let closedStreak = 0;

  while (Date.now() < burstUntil) {
    await acceptCookiesIfPresent(page);

    if (page.url().includes("/checkout")) {
      const result = await attemptCheckoutOnly(page, purchaseOptions);
      if (result.status === "completed") {
        log("info", `[${label}] Commande confirmée.`);
        await handlePurchaseResult(
          result,
          page,
          config,
          browser,
          context,
          finishOpts,
        );
        return true;
      }
      if (result.status === "clicked") {
        const ok = await handlePurchaseResult(
          result,
          page,
          config,
          browser,
          context,
          finishOpts,
        );
        if (ok) {
          log("info", `[${label}] Flux achat terminé.`);
          return true;
        }
      }
      if (result.status === "blocked") {
        log("warn", `[${label}] Checkout : ${result.reason}`);
      }
      await sleep(500);
      continue;
    }

    await page.goto(itemUrl, { waitUntil: "domcontentloaded" });
    const current = parseItemPageSnapshot(await page.content());

    if (!isPurchaseWindowOpen(current)) {
      closedStreak += 1;
      const backoff = Math.min(
        2_500,
        250 + closedStreak * 150,
      );
      const wait = Math.max(
        config.snipe.burst_refresh_ms,
        backoff,
      );
      await sleep(wait);
      continue;
    }
    closedStreak = 0;

    const result = await attemptPurchase(page, current, purchaseOptions);
    if (result.status === "completed") {
      log("info", `[${label}] Commande confirmée.`);
      await handlePurchaseResult(
        result,
        page,
        config,
        browser,
        context,
        finishOpts,
      );
      return true;
    }
    if (result.status === "clicked") {
      const ok = await handlePurchaseResult(
        result,
        page,
        config,
        browser,
        context,
        finishOpts,
      );
      if (ok) {
        log("info", `[${label}] Flux achat terminé.`);
        return true;
      }
    }
    if (result.status === "blocked") {
      log("warn", `[${label}] ${result.reason}`);
    }
    await sleep(config.snipe.burst_refresh_ms || 200);
  }

  log("warn", `[${label}] Burst expiré sans succès.`);
  return false;
}

export async function waitUntilCountdownReady(
  page: Page,
  itemUrl: string,
  config: AppConfig,
): Promise<ReturnType<typeof parseItemPageSnapshot>> {
  let snapshot = parseItemPageSnapshot(
    await fetchItemHtml(page, itemUrl),
  );
  let endMs = countdownEndMs(snapshot.buyPlugin);

  if (endMs === null && snapshot.rawBuyEnabled) {
    log("info", "Aucun compte à rebours — article déjà achetable.");
    return snapshot;
  }

  if (endMs !== null) {
    logWaitPlan(endMs, config);
  }

  while (true) {
    endMs = countdownEndMs(snapshot.buyPlugin);

    if (endMs === null && snapshot.rawBuyEnabled) {
      return snapshot;
    }

    if (endMs === null) {
      log("warn", "Compte à rebours actif, date de fin absente — resync…");
      await sleep(
        applyJitter(
          config.snipe.poll_interval_ms * 4,
          config.snipe.poll_jitter_ratio,
        ),
      );
      snapshot = parseItemPageSnapshot(await fetchItemHtml(page, itemUrl));
      continue;
    }

    let remaining = endMs - Date.now();
    log(
      "info",
      `Fin du compte à rebours : ${new Date(endMs).toISOString()} (dans ${Math.max(0, Math.round(remaining / 1000))} s)`,
    );

    const clockSleep = clockSleepBeforePollingMs(remaining, config);
    if (clockSleep > 0) {
      const wakeIn = Math.min(clockSleep, 60 * 60 * 1000);
      log(
        "info",
        `Prochaine vérif. dans ${Math.round(wakeIn / 60_000)} min (horloge locale, 0 requête).`,
      );
      await sleep(wakeIn);
      continue;
    }

    if (remaining <= config.snipe.preload_ms) {
      await acceptCookiesIfPresent(page);
      if (config.snipe.preload_ms > 0) {
        await page.goto(itemUrl, { waitUntil: "domcontentloaded" });
      }
      return parseItemPageSnapshot(await page.content());
    }

    snapshot = parseItemPageSnapshot(await fetchItemHtml(page, itemUrl));
    endMs = countdownEndMs(snapshot.buyPlugin);
    if (endMs === null) {
      continue;
    }

    remaining = endMs - Date.now();
    if (remaining <= config.snipe.preload_ms) {
      await acceptCookiesIfPresent(page);
      return snapshot;
    }

    const pollMs = applyJitter(
      adaptivePollIntervalMs(remaining, config),
      config.snipe.poll_jitter_ratio,
    );
    const untilPreload = remaining - config.snipe.preload_ms;
    await sleep(Math.min(pollMs, untilPreload));
  }
}

export function buildPurchaseOptions(config: AppConfig): PurchaseOptions {
  return {
    enablePurchase: config.safety.enable_purchase,
    maxPriceEur: config.safety.max_price_eur,
    advanceCheckout: config.safety.advance_checkout,
    clickPay: config.safety.click_pay,
    preferredRelaySubstring: config.snipe.preferred_relay_substring || null,
    phone: config.buyer.phone || null,
  };
}

export function itemLabel(url: string, index: number): string {
  const slug = url.split("/items/")[1]?.split("-").slice(0, 3).join("-") ?? url;
  return `#${index + 1} ${slug}`;
}
