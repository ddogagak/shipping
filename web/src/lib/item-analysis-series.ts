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
