import { extractSourceProductId } from "@/lib/purchases/product-id";

export const SERIES_CODE: Record<string, string> = {
  "나루토": "NAR",
  "헌터헌터": "HXH",
  "귀멸의칼날": "KNY",
  "나의히어로아카데미아": "MHA",
  "프리렌": "FRN",
  "진격의거인": "AOT",
  "치이카와": "CHI",
  "기타": "ETC",
};

export function getSeriesCode(seriesName: unknown) {
  return SERIES_CODE[String(seriesName || "기타")] || "ETC";
}

function fallbackSiteCode(urlRaw: unknown) {
  try {
    const hostname = new URL(String(urlRaw || "")).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    const name = hostname.split(".")[0].replace(/[^a-z0-9]/g, "");
    return (name.slice(0, 2) || "ET").toUpperCase();
  } catch {
    return "ET";
  }
}

export function getSourceSiteCode(urlRaw: unknown) {
  const raw = String(urlRaw || "").toLowerCase();
  if (raw.includes("taobao.com")) return "TB";
  if (raw.includes("tmall.com")) return "TM";
  if (raw.includes("1688.com")) return "A8";
  if (raw.includes("amiami.")) return "AA";
  if (raw.includes("animate")) return "AN";
  if (raw.includes("suruga-ya") || raw.includes("surugaya")) return "SG";
  if (raw.includes("jumpcs") || raw.includes("jumpcs.shueisha")) return "JC";
  if (raw.includes("ensky")) return "ES";
  if (raw.includes("amnibus")) return "AM";
  if (raw.includes("superdelivery")) return "SD";
  if (raw.includes("hobbystock")) return "HS";
  if (raw.includes("maxlimited")) return "ML";
  if (raw.includes("pochimart")) return "PM";
  if (raw.includes("metal-box")) return "MB";
  if (raw.includes("colleize")) return "CL";
  if (raw.includes("syokugan-ohkoku")) return "SO";
  if (raw.includes("mile-stone")) return "MS";
  if (raw.includes("mercari")) return "MC";
  if (raw.includes("amazon.co.jp")) return "AZ";
  return fallbackSiteCode(urlRaw);
}

export function getSourceProductKey(urlRaw: unknown) {
  const url = String(urlRaw || "").trim();
  const extracted = extractSourceProductId(url);
  if (extracted) return extracted;
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split("/").filter(Boolean).pop() || "";
    return tail.replace(/[^a-zA-Z0-9]/g, "").slice(-18) || "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export function buildInternalSku(args: {
  sourceSiteCode: string;
  seriesCode: string;
  productId: string;
  optionSeq: number;
}) {
  const site = String(args.sourceSiteCode || "ET").toUpperCase();
  const series = String(args.seriesCode || "ETC").toUpperCase();
  const product = String(args.productId || "UNKNOWN").replace(/[^a-zA-Z0-9]/g, "");
  const option = Math.max(0, Math.trunc(Number(args.optionSeq ?? 0))).toString().padStart(2, "0");
  return `${site}-${series}-${product}-${option}`;
}
