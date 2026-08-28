export function extractSourceProductId(rawUrl: string | null | undefined): string | null {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const queryKeys = ["gcode", "scode", "id", "itemId", "item_id", "offerId", "offer_id", "goodsId", "goods_id"];
    for (const key of queryKeys) {
      const value = url.searchParams.get(key)?.trim();
      if (value && /^[A-Za-z0-9_-]+$/.test(value)) return value;
    }

    const pathPatterns = [
      /\/products\/detail\/([A-Za-z0-9_-]+)/i,
      /\/pd_p\/([A-Za-z0-9_-]+)/i,
      /\/dp\/([A-Za-z0-9_-]+)/i,
      /\/item\/view\/([A-Za-z0-9_-]+)/i,
      /\/shop\/g\/g([A-Za-z0-9_-]+)/i,
      /\/offer\/(\d+)\.html/i,
      /\/item\/(\d+)(?:\.html)?/i,
      /\/(\d{6,})(?:\.html)?(?:\/)?$/i,
    ];
    for (const pattern of pathPatterns) {
      const match = url.pathname.match(pattern);
      if (match?.[1]) return match[1];
    }
  } catch {
    const match = raw.match(/[?&](?:gcode|scode|id|itemId|item_id|offerId|offer_id|goodsId|goods_id)=([A-Za-z0-9_-]+)/i)
      ?? raw.match(/\/products\/detail\/([A-Za-z0-9_-]+)/i)
      ?? raw.match(/\/pd_p\/([A-Za-z0-9_-]+)/i)
      ?? raw.match(/\/dp\/([A-Za-z0-9_-]+)/i)
      ?? raw.match(/\/item\/view\/([A-Za-z0-9_-]+)/i)
      ?? raw.match(/\/shop\/g\/g([A-Za-z0-9_-]+)/i)
      ?? raw.match(/\/offer\/(\d+)\.html/i)
      ?? raw.match(/\/(\d{6,})(?:\.html)?(?:[?#]|$)/i);
    if (match?.[1]) return match[1];
  }

  return null;
}
