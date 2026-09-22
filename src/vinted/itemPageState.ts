import { z } from "zod";

const buyPluginSchema = z.object({
  name: z.literal("buy"),
  type: z.literal("buy"),
  data: z.object({
    item_id: z.union([z.string(), z.number()]),
    seller_id: z.union([z.string(), z.number()]),
    closet_countdown_end_date: z.string().nullable(),
    is_sticky: z.boolean().optional(),
  }),
});

const sidebarPluginSchema = z.discriminatedUnion("name", [buyPluginSchema]);

export type BuyPluginState = z.infer<typeof buyPluginSchema>["data"];

export type ItemPageSnapshot = {
  buyPlugin: BuyPluginState | null;
  priceText: string | null;
  title: string | null;
  rawBuyEnabled: boolean;
};

function unescapeEmbeddedJson(fragment: string): string {
  return fragment.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function extractBuyPluginFromHtmlBlock(html: string): BuyPluginState | null {
  for (const marker of ['"name":"buy"', '\\"name\\":\\"buy\\"']) {
    const idx = html.indexOf(marker);
    if (idx < 0) continue;

    const start = html.lastIndexOf("{", idx);
    if (start < 0) continue;

    let depth = 0;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const raw = unescapeEmbeddedJson(html.slice(start, i + 1));
          try {
            const parsed = JSON.parse(raw);
            const plugin = sidebarPluginSchema.safeParse(parsed);
            if (plugin.success) return plugin.data.data;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

export function extractBuyPluginFromHtml(html: string): BuyPluginState | null {
  const fromBlock = extractBuyPluginFromHtmlBlock(html);
  if (fromBlock) return fromBlock;

  const endMatch = html.match(
    /closet_countdown_end_date\\?"\s*:\s*(null|\\?"[^"\\]+\\?")/,
  );
  const itemMatch = html.match(/item_id\\?"\s*:\s*\\?"(\d+)\\?"/);
  const sellerMatch = html.match(/seller_id\\?"\s*:\s*\\?"(\d+)\\?"/);
  if (!itemMatch || !sellerMatch) return null;

  let endDate: string | null = null;
  if (endMatch && endMatch[1] !== "null") {
    endDate = endMatch[1].replace(/\\"/g, "").replace(/"/g, "");
  }

  return {
    item_id: itemMatch[1],
    seller_id: sellerMatch[1],
    closet_countdown_end_date: endDate,
  };
}

export function extractTitleFromHtml(html: string): string | null {
  const og = html.match(/property="og:title"\s+content="([^"]+)"/i);
  return og?.[1] ?? null;
}

export function extractPriceFromHtml(html: string): string | null {
  const itemPrice = html.match(
    /"price"\s*:\s*\{\s*"amount"\s*:\s*"([\d.,]+)"/,
  );
  if (itemPrice) return itemPrice[1];

  const escaped = html.match(
    /\\"price\\":\{\\"amount\\":\\"([\d.,]+)\\"/,
  );
  if (escaped) return escaped[1];

  const euro = html.match(/(\d+[,.]\d{2})\s*€/);
  return euro?.[1] ?? null;
}

export function parseItemPageSnapshot(html: string): ItemPageSnapshot {
  const buyPlugin = extractBuyPluginFromHtml(html);
  return {
    buyPlugin,
    priceText: extractPriceFromHtml(html),
    title: extractTitleFromHtml(html),
    rawBuyEnabled: buyPlugin?.closet_countdown_end_date === null,
  };
}

export function countdownEndMs(state: BuyPluginState | null): number | null {
  if (!state?.closet_countdown_end_date) return null;
  const ms = Date.parse(state.closet_countdown_end_date);
  return Number.isNaN(ms) ? null : ms;
}

export function isPurchaseWindowOpen(
  snapshot: ItemPageSnapshot,
  now = Date.now(),
): boolean {
  const endMs = countdownEndMs(snapshot.buyPlugin);
  if (endMs !== null && now >= endMs) return true;
  return snapshot.rawBuyEnabled;
}
