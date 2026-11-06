export type PricingSettings = {
  jpyRate: number;
  cnyRate: number;
  importCostMultiplier: number;
  fixedCost: number;
  minimumProfit: number;
  targetProfitRate: number;
  salesRetentionRate: number;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  jpyRate: 10,
  cnyRate: 230,
  importCostMultiplier: 1.2,
  fixedCost: 5000,
  minimumProfit: 10000,
  targetProfitRate: 0.08,
  salesRetentionRate: 0.84,
};

// Applies only to JPY/CNY products containing exactly one sellable item per purchase unit.
export const SINGLE_ITEM_FOREIGN_PRICING = {
  fixedCost: 2000,
  minimumProfit: 2000,
  targetProfitRate: 0.15,
} as const;

// Applied to Japanese products with exactly one sellable item per box.
// Thresholds are based on the original JPY purchase price, not converted KRW.
export function singleItemJpyFixedCost(purchasePriceJpy: number): number {
  const yen = Number(purchasePriceJpy);
  if (yen >= 2000) return 5000;
  if (yen >= 1000) return 3000;
  if (yen >= 500) return 2000;
  return 1000;
}

// Domestic single-item goods: purchase cost plus the KRW price-tier fee.
// Do not apply the 20% import uplift to local purchases.
export function singleItemKrwFixedCost(purchasePriceKrw: number): number {
  const won = Number(purchasePriceKrw);
  if (won >= 20000) return 5000;
  if (won >= 10000) return 3000;
  if (won >= 5000) return 2000;
  return 1000;
}

export function calculateDomesticSalePricing(purchasePrice: number, boxCount: number) {
  const purchase = Math.max(0, Number(purchasePrice) || 0);
  const count = Math.max(1, Math.trunc(Number(boxCount) || 1));
  const isSingle = count === 1;
  const costPrice = Math.round(purchase + (isSingle ? singleItemKrwFixedCost(purchase) : 0));
  const targetProfit = isSingle
    ? Math.max(2000, costPrice * 0.15)
    : 0;
  // Keep the existing multi-piece Korean formula unchanged.
  const minimumMarginPrice = costPrice > 0
    ? isSingle
      ? Math.ceil((costPrice + targetProfit) / DEFAULT_PRICING_SETTINGS.salesRetentionRate)
      : Math.ceil(costPrice / 0.69)
    : 0;
  return {
    costPrice,
    targetProfit: Math.ceil(targetProfit),
    minimumMarginPrice,
    unitSalePrice: Math.ceil(minimumMarginPrice / count)
  };
}

export function getEffectivePricingSettings(
  currency: string,
  boxCount: number | null,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
  purchasePrice?: number
): PricingSettings {
  const isSingle = Number(boxCount) === 1;
  if (isSingle && currency === "JPY") {
    return { ...settings, ...SINGLE_ITEM_FOREIGN_PRICING,
      fixedCost: purchasePrice === undefined
        ? SINGLE_ITEM_FOREIGN_PRICING.fixedCost
        : singleItemJpyFixedCost(purchasePrice) };
  }
  return isSingle && currency === "CNY"
    ? { ...settings, ...SINGLE_ITEM_FOREIGN_PRICING }
    : settings;
}

export const PRICING_SETTINGS_STORAGE_KEY = "ddoga-pricing-settings";

export function loadPricingSettings(): PricingSettings {
  if (typeof window === "undefined") return DEFAULT_PRICING_SETTINGS;

  try {
    const raw = window.localStorage.getItem(PRICING_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING_SETTINGS;
    return { ...DEFAULT_PRICING_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PRICING_SETTINGS;
  }
}

export function savePricingSettings(settings: PricingSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRICING_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function calculatePricing(
  currency: string,
  purchasePrice: number,
  boxCount: number | null,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
) {
  const rate =
    currency === "CNY" ? settings.cnyRate :
    currency === "JPY" ? settings.jpyRate :
    settings.jpyRate;

  const effectiveSettings = getEffectivePricingSettings(currency, boxCount, settings, purchasePrice);
  const purchase = Number(purchasePrice) || 0;
  const packs = Number(boxCount) || 0;

  const costPrice = Math.round(
    purchase * rate * effectiveSettings.importCostMultiplier + effectiveSettings.fixedCost
  );

  const targetProfit = Math.max(
    effectiveSettings.minimumProfit,
    costPrice * effectiveSettings.targetProfitRate
  );

  const minimumMarginPrice = Math.ceil(
    (costPrice + targetProfit) / settings.salesRetentionRate
  );

  const unitSalePrice =
    packs > 0 ? Math.ceil(minimumMarginPrice / packs) : 0;

  return {
    costPrice,
    targetProfit: Math.ceil(targetProfit),
    minimumMarginPrice,
    unitSalePrice,
  };
}
