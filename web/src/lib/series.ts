export function normalizeSeriesName(seriesName: unknown, ...texts: unknown[]) {
  const current = String(seriesName || "").trim();
  const haystack = [current, ...texts].map((v) => String(v || "")).join(" ").toLowerCase();
  if (/(먼작귀|치이카와|chiikawa|ちいかわ|吉伊卡哇)/i.test(haystack)) return "치이카와";
  return current || "기타";
}
