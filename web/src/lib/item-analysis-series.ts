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
 const keyword=classifySeriesByKeywords(title,rules);
 const stored=String(recordedSeries||"").trim();
 if(keyword.matches.length>1)return {series:stored&&stored!=="기타"&&stored!=="미분류"?stored:"미분류 (키워드 충돌)",source:"conflict",matches:keyword.matches};
 if(keyword.series)return {series:keyword.series,source:"keyword",matches:keyword.matches};
 if(stored&&stored!=="기타"&&stored!=="미분류")return {series:stored,source:"recorded",matches:[]};
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
export function analysisSeriesForSale(name:string,image:string|null|undefined,rules:SeriesKeywordRule[],overrides:Record<string,string>):string{
 const manual=overrides[analysisOverrideKey(name,image)]||overrides[normalizedKeywordText(name)];
 if(manual)return manual==="야생"?"쿠지":manual;
 const result=classifySeriesByKeywords(name,rules);
 if(result.matches.length>1)return "키워드 충돌";
 return result.series||"미분류";
}
