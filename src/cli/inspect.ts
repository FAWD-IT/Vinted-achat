import { loadConfig, resolveAuthStatePath, resolveItemUrl } from "../config.js";
import { log } from "../util.js";
import { createContext, fetchItemHtml } from "../vinted/browser.js";
import {
  countdownEndMs,
  parseItemPageSnapshot,
} from "../vinted/itemPageState.js";
import { normalizeItemUrl } from "../vinted/itemUrl.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const itemUrl = normalizeItemUrl(
    resolveItemUrl(config),
    config.vinted.base_url,
  );
  const { browser, context, page } = await createContext(
    config,
    resolveAuthStatePath(),
  );

  try {
    const html = await fetchItemHtml(page, itemUrl);
    const snapshot = parseItemPageSnapshot(html);
    const endMs = countdownEndMs(snapshot.buyPlugin);

    log("info", `Titre : ${snapshot.title ?? "?"}`);
    log("info", `Prix (extrait) : ${snapshot.priceText ?? "?"}`);
    log(
      "info",
      `closet_countdown_end_date : ${snapshot.buyPlugin?.closet_countdown_end_date ?? "null"}`,
    );
    if (endMs) {
      log("info", `Fin prévue (ISO) : ${new Date(endMs).toISOString()}`);
    }
    log(
      "info",
      `Achetable maintenant (heuristique) : ${snapshot.rawBuyEnabled ? "oui" : "non"}`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  log("error", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
