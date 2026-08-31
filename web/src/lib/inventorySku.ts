export type InventorySkuParts = {
  sourceSiteCode: string;
  sourceProductId: string;
  optionSeq: number;
  internalSku: string;
};

function getSiteCode(sourceUrl: string) {
  const url = sourceUrl.toLowerCase();
  if (url.includes("taobao.com")) return "TB";
  if (url.includes("tmall.com")) return "TM";
  if (url.includes("1688.com")) return "A8";
  if (url.includes("amiami.")) return "AA";
  if (url.includes("animate")) return "AN";
  if (url.includes("suruga-ya") || url.includes("surugaya")) return "SG";
  if (url.includes("jumpcs")) return "JC";
  if (url.includes("ensky")) return "ES";
  if (url.includes("amnibus")) return "AM";
  if (url.includes("maxlimited")) return "ML";
  if (url.includes("pochimart")) return "PM";
  if (url.includes("hobbystock")) return "HS";
  if (url.includes("metal-box")) return "MB";
  if (url.includes("colleize")) return "CL";
  if (url.includes("syokugan-ohkoku")) return "SO";
  if (url.includes("mile-stone")) return "MS";
  if (url.includes("mercari")) return "MC";
  if (url.includes("amazon.co.jp")) return "AZ";
  return "ETC";
}

function getSeriesCode(seriesName: string) {
  switch (seriesName) {
    case "나루토": return "NAR";
    case "헌터헌터": return "HXH";
    case "귀멸의칼날": return "KNY";
    case "나의히어로아카데미아": return "MHA";
    case "프리렌": return "FRN";
    case "진격의거인": return "AOT";
    case "치이카와": return "CHI";
    default: return "ETC";
  }
}

function getProductId(sourceUrl: string) {
  const raw = String(sourceUrl || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const keys = [
      "gcode", "scode", "id", "itemId", "item_id",
      "offerId", "offer_id", "goodsId", "goods_id",
    ];
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
  } catch {
    // 아래 정규식 fallback으로 계속 처리
  }

  const patterns = [
    /\/offer\/([0-9]+)\.html/i,
    /\/item\/([0-9]+)(?:\.html)?/i,
    /\/([0-9]{6,})(?:\.html)?(?:[?#]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

export function buildInventorySku(
  sourceUrl: string,
  seriesName: string,
  optionSeqInput: unknown = 0
): InventorySkuParts | null {
  const sourceProductId = getProductId(sourceUrl);
  if (!sourceProductId) return null;

  const parsedOptionSeq = Number(optionSeqInput ?? 0);
  if (!Number.isInteger(parsedOptionSeq) || parsedOptionSeq < 0) {
    throw new Error("옵션번호는 0 이상의 정수로 입력해줘.");
  }

  const sourceSiteCode = getSiteCode(sourceUrl);
  const seriesCode = getSeriesCode(seriesName || "기타");
  const cleanProductId = sourceProductId.replace(/[^A-Za-z0-9]/g, "");
  if (!cleanProductId) return null;

  const optionText = String(parsedOptionSeq).padStart(2, "0");
  return {
    sourceSiteCode,
    sourceProductId,
    optionSeq: parsedOptionSeq,
    internalSku: `${sourceSiteCode}-${seriesCode}-${cleanProductId}-${optionText}`,
  };
}
