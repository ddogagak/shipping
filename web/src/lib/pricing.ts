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

  const purchase = Number(purchasePrice) || 0;
  const packs = Number(boxCount) || 0;

  const costPrice = Math.round(
    purchase * rate * settings.importCostMultiplier + settings.fixedCost
  );

  const targetProfit = Math.max(
    settings.minimumProfit,
    costPrice * settings.targetProfitRate
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
