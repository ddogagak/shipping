export const DEFAULT_ANALYSIS_SERIES=["헌터헌터","귀멸의칼날","나의히어로아카데미아","프리렌","진격의거인","치이카와","약사의혼잣말","나루토","쿠지","그비돌","디즈니","기타","미분류"] as const;
export type SeriesKeywordRule={series_name:string;keywords:string[];updated_at?:string};
export function normalizedKeywordText(value:unknown):string{
 return String(value??"").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g,"");
}
export function classifySeriesByKeywords(title:string,rules:SeriesKeywordRule[]):{series:string|null;matches:string[]}{
 const haystack=normalizedKeywordText(title);
 if(!haystack)return {series:null,matches:[]};
 const matches=rules.filter(rule=>rule.keywords.some(keyword=>{
  const key=normalizedKeywordText(keyword);
  return key.length>0&&haystack.includes(key);
 })).map(rule=>rule.series_name);
 return {series:matches.length===1?matches[0]:null,matches};
}
export function resolveAnalysisSeries(title:string,recordedSeries:string|null|undefined,rules:SeriesKeywordRule[]):{series:string;source:"keyword"|"recorded"|"unclassified"|"conflict";matches:string[]}{
 const stored=String(recordedSeries||"").trim();
 if(stored&&stored!=="기타"&&stored!=="미분류")return {series:stored,source:"recorded",matches:[]};
 const keyword=classifySeriesByKeywords(title,rules);
 if(keyword.matches.length>1)return {series:"미분류 (키워드 충돌)",source:"conflict",matches:keyword.matches};
 if(keyword.series)return {series:keyword.series,source:"keyword",matches:keyword.matches};
 return {series:"미분류",source:"unclassified",matches:[]};
}

// Keep the manual-classification key identical across the sales-management
// table and the detailed Wise sales analysis (name + original photo).
export function analysisOverrideKey(name:string,image:string|null|undefined):string{
 const normalized=normalizedKeywordText(name);
 const url=String(image||"").trim().split("?")[0];
 if(!url)return normalized;
 let h1=2166136261,h2=0x9e3779b9;
 for(let i=0;i<url.length;i++){const c=url.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,2246822519);}
 return "photo:"+normalized.slice(0,370)+":"+(h1>>>0).toString(36)+":"+(h2>>>0).toString(36);
}
export type AnalysisSaleIdentity={id:string;item_name:string;image_url?:string|null;video_id?:string|null};
// The Wise image URL contains the original listing ID, not an image content hash.
// This is a string lookup only; no network fetch or image comparison is needed.
export function wiseListingId(image:string|null|undefined):string|null{
 return String(image||"").match(/^https?:\/\/image\.wyyyes\.com\/svc\/sellers\/[^/]+\/stock\/(\d+)_/i)?.[1]||null;
}
export function saleIdentityKey(row:AnalysisSaleIdentity):string{
 return "sale:"+String(row.id);
}
export function listingIdentityKey(row:AnalysisSaleIdentity):string{
 const listing=wiseListingId(row.image_url);
 return listing&&row.video_id?JSON.stringify([row.video_id,listing]):saleIdentityKey(row);
}
export function manualSeriesForSale(row:AnalysisSaleIdentity,overrides:Record<string,string>):string|null{
 // Legacy photo-specific classifications remain readable; name-only legacy
 // entries are unsafe when the same label is reused in a later broadcast.
 const saved=overrides[saleIdentityKey(row)];
 if(saved)return saved==="야생"?"쿠지":saved;
 const legacy=row.image_url?analysisOverrideKey(row.item_name,row.image_url):"";
 const manual=legacy.startsWith("photo:")?overrides[legacy]:undefined;
 return manual?(manual==="야생"?"쿠지":manual):null;
}
export function analysisSeriesForSale(row:AnalysisSaleIdentity,rules:SeriesKeywordRule[],overrides:Record<string,string>):string{
 const manual=manualSeriesForSale(row,overrides);
 if(manual)return manual;
 const result=classifySeriesByKeywords(row.item_name,rules);
 if(result.matches.length>1)return "키워드 충돌";
 return result.series||"미분류";
}
