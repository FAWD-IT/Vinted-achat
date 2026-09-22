import path from "node:path";
import { loadConfig, resolveAuthStatePath } from "../config.js";
import { ensureDataDir } from "../vinted/browser.js";
import { launchBrowser } from "../vinted/launchBrowser.js";
import { log } from "../util.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const authStatePath = resolveAuthStatePath();
  await ensureDataDir(authStatePath);

  log("info", "Ouverture du navigateur — connectez-vous à Vinted, puis fermez la fenêtre.");
  const browser = await launchBrowser({ ...config, browser: { ...config.browser, headless: false } });

  const context = await browser.newContext({
    locale: `${config.vinted.locale}-FR`,
    timezoneId: "Europe/Paris",
  });

  const page = await context.newPage();
  await page.goto(`${config.vinted.base_url}/`, { waitUntil: "domcontentloaded" });

  log(
    "info",
    "Connectez-vous puis revenez ici et appuyez sur Entrée pour enregistrer la session.",
  );

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  await context.storageState({ path: authStatePath });
  await browser.close();

  log("info", `Session enregistrée : ${path.relative(process.cwd(), authStatePath)}`);
}

main().catch((err) => {
  log("error", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
