export const APOTHECARY_SERIES = "약사의혼잣말";
export const APOTHECARY_ALIASES = ["약사의혼잣말","약사의 혼잣말","약혼","약삿말","마오마오","진시","薬屋のひとりごと","The Apothecary Diaries"] as const;
export function isApothecarySeries(...texts:unknown[]){
 const combined=texts.map(v=>String(v||"")).join(" ").toLowerCase();
 // '약혼' is recognized as an explicit alias/token to avoid matching '약혼반지'.
 return /(약사의\s*혼잣말|약삿말|마오마오|薬屋のひとりごと|the apothecary diaries|(^|[^가-힣])약혼($|[^가-힣])|(^|[^가-힣])진시($|[^가-힣]))/i.test(combined);
}
export function normalizeSeriesName(seriesName:unknown,...texts:unknown[]){
 const current=String(seriesName||"").trim();
 const haystack=[current,...texts].map(v=>String(v||"")).join(" ").toLowerCase();
 if(/(먼작귀|치이카와|chiikawa|ちいかわ|吉伊卡哇)/i.test(haystack))return "치이카와";
 if(isApothecarySeries(current))return APOTHECARY_SERIES;
 if((!current||current==="기타")&&isApothecarySeries(...texts))return APOTHECARY_SERIES;
 return current||"기타";
}
