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

export function getEffectivePricingSettings(
  currency: string,
  boxCount: number | null,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS
): PricingSettings {
  const foreign = currency === "JPY" || currency === "CNY";
  return foreign && Number(boxCount) === 1
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

  const effectiveSettings = getEffectivePricingSettings(currency, boxCount, settings);
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
