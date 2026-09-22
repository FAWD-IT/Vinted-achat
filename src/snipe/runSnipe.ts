import {
  loadConfig,
  resolveAuthStatePath,
  resolveItemUrls,
} from "../config.js";
import { log, sleep } from "../util.js";
import { createContext } from "../vinted/browser.js";
import { countdownEndMs } from "../vinted/itemPageState.js";
import {
  buildPurchaseOptions,
  burstPurchaseLoop,
  itemLabel,
  waitUntilCountdownReady,
} from "./burst.js";
import { closeBrowser } from "./finishRun.js";
import { openMultiItemPages } from "./preloadPages.js";

export async function runSnipe(): Promise<void> {
  const config = loadConfig();
  const authStatePath = resolveAuthStatePath();
  const itemUrls = resolveItemUrls(config);
  const stopOnFirst = config.snipe.multi_stop_on_first_success;

  log("info", `${itemUrls.length} annonce(s) cible(s) :`);
  for (const [i, url] of itemUrls.entries()) {
    log("info", `  ${i + 1}. ${url}`);
  }

  if (!config.safety.enable_purchase) {
    log(
      "warn",
      "Mode observation : enable_purchase désactivé — aucun achat.",
    );
  }

  const { browser, context, page: clockPage } = await createContext(
    config,
    authStatePath,
  );

  try {
    const snapshot = await waitUntilCountdownReady(
      clockPage,
      itemUrls[0],
      config,
    );
    const endMs =
      countdownEndMs(snapshot.buyPlugin) ??
      Date.now() + config.snipe.preload_ms;

    const pages =
      itemUrls.length > 1
        ? await openMultiItemPages(context, clockPage, itemUrls, config)
        : [clockPage];

    const fireAt = endMs - config.snipe.fire_early_ms;
    const waitMs = fireAt - Date.now();
    if (waitMs > 0) {
      log("info", `Attente finale ${Math.round(waitMs / 1000)} s avant le drop (sans rechargement)…`);
      await sleep(waitMs);
    }

    const burstUntil = Date.now() + config.snipe.burst_duration_ms;
    const purchaseOptions = buildPurchaseOptions(config);

    if (itemUrls.length === 1) {
      const ok = await burstPurchaseLoop(
        clockPage,
        itemUrls[0],
        itemLabel(itemUrls[0], 0),
        config,
        purchaseOptions,
        browser,
        context,
        burstUntil,
        true,
      );
      if (!ok) {
        log("error", "Achat non réussi.");
        await closeBrowser(browser, context, config, 2_000);
      }
      return;
    }

    log(
      "info",
      stopOnFirst
        ? `Drop multi : ${itemUrls.length} onglets — arrêt au 1er succès.`
        : `Drop multi : ${itemUrls.length} onglets — tentative d'achat sur chaque annonce.`,
    );

    let abortOthers = false;
    const results = await Promise.all(
      pages.map(async (page, i) => {
        if (abortOthers) {
          return false;
        }
        const ok = await burstPurchaseLoop(
          page,
          itemUrls[i],
          itemLabel(itemUrls[i], i),
          config,
          purchaseOptions,
          browser,
          context,
          burstUntil,
          stopOnFirst,
        );
        if (ok && stopOnFirst) {
          abortOthers = true;
        }
        return ok;
      }),
    );

    const successCount = results.filter(Boolean).length;
    if (successCount === 0) {
      log("error", "Aucun achat réussi sur les annonces cibles.");
      await closeBrowser(browser, context, config, 2_000);
      return;
    }

    log("info", `${successCount}/${itemUrls.length} achat(s) réussi(s).`);
    if (!stopOnFirst) {
      await closeBrowser(browser, context, config, 4_000);
    }
  } catch (err) {
    log("error", err instanceof Error ? err.message : String(err));
    await closeBrowser(browser, context, config, 0);
  }
}
