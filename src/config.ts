import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  vinted: z.object({
    base_url: z.string().url().default("https://www.vinted.fr"),
    locale: z.string().default("fr"),
  }),
  snipe: z.object({
    item_url: z.string().optional().default(""),
    item_urls: z.array(z.string().url()).optional().default([]),
    multi_stop_on_first_success: z.boolean().default(false),
    smart_wait: z.boolean().default(true),
    poll_start_before_ms: z.number().int().nonnegative().default(900_000),
    poll_jitter_ratio: z.number().min(0).max(0.5).default(0.12),
    multi_tab_open_gap_ms: z.number().int().nonnegative().default(800),
    preload_ms: z.number().int().nonnegative().default(3000),
    poll_interval_ms: z.number().int().positive().default(500),
    burst_refresh_ms: z.number().int().nonnegative().default(150),
    burst_duration_ms: z.number().int().positive().default(15000),
    fire_early_ms: z.number().int().nonnegative().default(80),
    preferred_relay_substring: z.string().optional().default(""),
  }),
  safety: z.object({
    enable_purchase: z.boolean().default(false),
    max_price_eur: z.number().positive().nullable().optional(),
    advance_checkout: z.boolean().default(true),
    click_pay: z.boolean().default(false),
  }),
  browser: z.object({
    headless: z.boolean().default(false),
    slow_mo: z.number().int().nonnegative().default(0),
    channel: z.string().optional().default(""),
  }),
  buyer: z.object({
    phone: z.string().optional().default(""),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

const defaultConfig: AppConfig = configSchema.parse({
  vinted: {},
  snipe: {},
  safety: {},
  browser: {},
  buyer: {},
});

function loadYamlConfig(): Partial<AppConfig> {
  const configPath = path.resolve("config.yaml");
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = parseYaml(fs.readFileSync(configPath, "utf8"));
  return raw as Partial<AppConfig>;
}

function envOverrides(): Partial<AppConfig> {
  const safety: Partial<AppConfig["safety"]> = {};
  if (process.env.ENABLE_PURCHASE !== undefined) {
    safety.enable_purchase =
      process.env.ENABLE_PURCHASE === "true" ||
      process.env.ENABLE_PURCHASE === "1";
  }
  if (process.env.CLICK_PAY !== undefined) {
    safety.click_pay =
      process.env.CLICK_PAY === "true" || process.env.CLICK_PAY === "1";
  }
  if (process.env.MAX_PRICE_EUR !== undefined && process.env.MAX_PRICE_EUR !== "") {
    const maxPrice = Number.parseFloat(process.env.MAX_PRICE_EUR);
    safety.max_price_eur = Number.isNaN(maxPrice) ? null : maxPrice;
  }

  return {
    vinted: {
      base_url: process.env.VINTED_BASE_URL ?? defaultConfig.vinted.base_url,
      locale: defaultConfig.vinted.locale,
    },
    safety,
    buyer: {
      phone: process.env.VINTED_PHONE?.trim() ?? "",
    },
  } as Partial<AppConfig>;
}

export function loadConfig(): AppConfig {
  const merged = {
    ...defaultConfig,
    ...loadYamlConfig(),
    ...envOverrides(),
    vinted: {
      ...defaultConfig.vinted,
      ...loadYamlConfig().vinted,
      ...envOverrides().vinted,
    },
    snipe: {
      ...defaultConfig.snipe,
      ...(loadYamlConfig().snipe ?? {}),
      ...(process.env.ITEM_URL ? { item_url: process.env.ITEM_URL } : {}),
      ...(process.env.ITEM_URLS
        ? {
            item_urls: process.env.ITEM_URLS.split(",")
              .map((u) => u.trim())
              .filter(Boolean),
          }
        : {}),
    },
    safety: {
      ...defaultConfig.safety,
      ...loadYamlConfig().safety,
      ...envOverrides().safety,
    },
    browser: {
      ...defaultConfig.browser,
      ...loadYamlConfig().browser,
      ...(process.env.BROWSER_CHANNEL
        ? { channel: process.env.BROWSER_CHANNEL.trim() }
        : {}),
    },
    buyer: {
      ...defaultConfig.buyer,
      ...loadYamlConfig().buyer,
      ...envOverrides().buyer,
    },
  };

  return configSchema.parse(merged);
}

export function resolveAuthStatePath(): string {
  return path.resolve(
    process.env.AUTH_STATE_PATH ?? "data/auth-state.json",
  );
}

function normalizeItemUrl(url: string, baseUrl: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const base = new URL(baseUrl);
    if (parsed.hostname !== base.hostname) {
      parsed.hostname = base.hostname;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

export function resolveItemUrls(config: AppConfig): string[] {
  const fromList = (config.snipe.item_urls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => normalizeItemUrl(u, config.vinted.base_url));

  if (fromList.length > 0) {
    return [...new Set(fromList)];
  }

  const single = config.snipe.item_url?.trim();
  if (single) {
    return [normalizeItemUrl(single, config.vinted.base_url)];
  }

  throw new Error(
    "URL d'annonce manquante : snipe.item_urls / snipe.item_url dans config.yaml ou ITEM_URL(S) dans .env",
  );
}

export function resolveItemUrl(config: AppConfig): string {
  return resolveItemUrls(config)[0];
}
