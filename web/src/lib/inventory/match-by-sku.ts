import { buildInternalSku, getSeriesCode, getSourceProductKey, getSourceSiteCode } from "@/lib/inventory/internal-sku";

/** Inventory SKU is a stable identifier. Display names are never match keys. */
export function resolveInventorySku(row: Record<string, any>): string {
  const stored = String(row.internal_sku || "").trim();
  if (stored) return stored;
  const sourceUrl = String(row.source_url || "").trim();
  const siteCode = String(row.source_site_code || "").trim() || (sourceUrl ? getSourceSiteCode(sourceUrl) : "");
  const productId = String(row.source_product_id || "").trim() || (sourceUrl ? getSourceProductKey(sourceUrl) : "");
  if (!siteCode || !productId || productId === "UNKNOWN") return "";
  return buildInternalSku({
    sourceSiteCode: siteCode,
    seriesCode: getSeriesCode(row.series_name),
    productId,
    optionSeq: Number(row.option_seq ?? 0),
  });
}

/** Duplicate SKUs are intentionally excluded to avoid assigning the wrong image. */
export function uniqueInventoryBySku<T extends Record<string, any>>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const key = resolveInventorySku(row);
    if (!key) continue;
    if (result.has(key)) ambiguous.add(key);
    else result.set(key, row);
  }
  for (const key of ambiguous) result.delete(key);
  return result;
}
