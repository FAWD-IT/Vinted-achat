import { chromium, type Browser, type LaunchOptions } from "playwright";
import type { AppConfig } from "../config.js";
import { log } from "../util.js";

const CHANNELS = new Set(["chrome", "msedge", "chrome-beta", "msedge-beta"]);

export function resolveBrowserChannel(config: AppConfig): string | undefined {
  const fromEnv = process.env.BROWSER_CHANNEL?.trim();
  const fromYaml = config.browser.channel?.trim();
  const raw = fromEnv || fromYaml || "";
  if (!raw) {
    return undefined;
  }
  if (!CHANNELS.has(raw)) {
    log(
      "warn",
      `Canal navigateur inconnu "${raw}" — chromium Playwright par défaut.`,
    );
    return undefined;
  }
  return raw;
}

/** Chromium Playwright est souvent flaggé ; Edge/Chrome installés passent mieux (surtout Windows). */
export async function launchBrowser(config: AppConfig): Promise<Browser> {
  const channel = resolveBrowserChannel(config);
  const options: LaunchOptions = {
    headless: config.browser.headless,
    slowMo: config.browser.slow_mo,
  };

  if (channel) {
    options.channel = channel as LaunchOptions["channel"];
    options.ignoreDefaultArgs = ["--enable-automation"];
    log("info", `Navigateur : ${channel} (installé sur la machine).`);
  } else {
    log(
      "info",
      "Navigateur : Chromium Playwright — sur Windows, préférez BROWSER_CHANNEL=msedge dans .env",
    );
  }

  return chromium.launch(options);
}

export function isVintedSessionBlocked(html: string): boolean {
  return (
    /session a été bloquée/i.test(html) ||
    /session has been blocked/i.test(html) ||
    /activité inhabituelle ou automatisée/i.test(html) ||
    /unusual or automated activity/i.test(html)
  );
}

export class VintedSessionBlockedError extends Error {
  constructor() {
    super(
      "Vinted a bloqué la session (activité automatisée). Arrêt — voir docs/deployment-other-pc.md",
    );
    this.name = "VintedSessionBlockedError";
  }
}
