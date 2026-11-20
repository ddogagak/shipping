export function saleUnits(value: unknown): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 1;
}

export function effectiveSaleUnits(manual: unknown, links: ReadonlyArray<{ quantity: number }>): number {
  return manual != null ? saleUnits(manual) : links.length ? links.reduce((sum, link) => sum + saleUnits(link.quantity), 0) : 1;
}
