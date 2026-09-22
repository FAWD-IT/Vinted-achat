import type { AppConfig } from "../config.js";
import { log } from "../util.js";

/** Délai avant la prochaine requête HTTP, selon le temps restant avant le drop. */
export function adaptivePollIntervalMs(
  remainingMs: number,
  config: AppConfig,
): number {
  if (!config.snipe.smart_wait) {
    return config.snipe.poll_interval_ms;
  }

  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;

  if (remainingMs > 6 * hour) return 30 * minute;
  if (remainingMs > 3 * hour) return 15 * minute;
  if (remainingMs > 1 * hour) return 10 * minute;
  if (remainingMs > 30 * minute) return 5 * minute;
  if (remainingMs > 15 * minute) return 2 * minute;
  if (remainingMs > 5 * minute) return 60 * second;
  if (remainingMs > 2 * minute) return 30 * second;
  if (remainingMs > 60 * second) return 15 * second;
  if (remainingMs > 20 * second) return 5 * second;

  return Math.max(config.snipe.poll_interval_ms, 2 * second);
}

const second = 1000;

export function applyJitter(ms: number, ratio: number): number {
  if (ratio <= 0 || ms <= 0) {
    return ms;
  }
  const spread = ms * ratio;
  const jittered = ms + (Math.random() * 2 - 1) * spread;
  return Math.max(second, Math.round(jittered));
}

/** Temps à dormir sans aucune requête avant de commencer le polling adaptatif. */
export function clockSleepBeforePollingMs(
  remainingMs: number,
  config: AppConfig,
): number {
  if (!config.snipe.smart_wait) {
    return 0;
  }

  const pollHorizon = config.snipe.poll_start_before_ms + config.snipe.preload_ms;
  if (remainingMs <= pollHorizon) {
    return 0;
  }

  return remainingMs - pollHorizon;
}

export function logWaitPlan(endMs: number, config: AppConfig): void {
  const remaining = endMs - Date.now();
  const clock = clockSleepBeforePollingMs(remaining, config);
  if (clock > 60_000) {
    log(
      "info",
      `Veille ${Math.round(clock / 60_000)} min sans requête Vinted (smart_wait).`,
    );
  }
  if (config.snipe.smart_wait) {
    log(
      "info",
      `Polling adaptatif à partir de ${Math.round(config.snipe.poll_start_before_ms / 60_000)} min avant le drop.`,
    );
  }
}
