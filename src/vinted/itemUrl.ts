export function parseItemIdFromUrl(itemUrl: string): string {
  const url = new URL(itemUrl);
  const match = url.pathname.match(/\/items\/(\d+)/);
  if (!match) {
    throw new Error(`Impossible d'extraire l'ID article depuis : ${itemUrl}`);
  }
  return match[1];
}

export function normalizeItemUrl(itemUrl: string, baseUrl: string): string {
  const url = new URL(itemUrl, baseUrl);
  const id = parseItemIdFromUrl(url.href);
  return new URL(`/items/${id}`, url.origin).href;
}
