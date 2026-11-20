export type TypeKeywordRule={type_name:string;keywords:string[]};
export const DEFAULT_ANALYSIS_TYPES=["지류","아크릴","뱃지","피규어","키링","인형","마그넷","문구"];
export const normalizeTypeKeyword=(value:unknown)=>String(value??"").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"");
const CLEAR_FILE=["클리어파일","클리어화일","clear file","クリアファイル","文件夹","資料夾"].map(normalizeTypeKeyword);
const aliases:Record<string,string>={poster:"지류",acrylicstand:"아크릴",acrylickeytag:"키링",keyholder:"키링",clearfile:"문구"};
export function classifyTypeByKeywords(name:unknown,rules:TypeKeywordRule[]){
 // Work titles such as 카드캡터 사쿠라 or 데스노트 are not item-type signals.
 const title=normalizeTypeKeyword(name).replace(/카드캡터|カードキャプター|cardcaptor|데스노트|デスノート/g,"");
 const hits=rules.flatMap(rule=>rule.keywords.map(normalizeTypeKeyword).filter(word=>word&&title.includes(word)).map(word=>({type:rule.type_name,word})));
 // More specific compound terms beat the shorter terms inside them (e.g. 아크릴키링).
 const specific=hits.filter(hit=>!hits.some(other=>other.type!==hit.type&&other.word.length>hit.word.length&&other.word.includes(hit.word)));
 const matches=[...new Set(specific.map(hit=>hit.type))];
 return {type:matches.length===1?matches[0]:matches.length>1?"미분류(키워드 충돌)":"미분류",matches};
}
export function resolveAnalysisType(name:unknown,registered:unknown,rules:TypeKeywordRule[]){
 const raw=String(registered??"").trim(),normalized=normalizeTypeKeyword(raw);
 const title=normalizeTypeKeyword(name);
 const clearFile=CLEAR_FILE.some(word=>title.includes(word));
 // Explicit business rule: clear files are stationery even if previously entered as paper.
 if((!raw||raw==="지류"||raw==="기타"||raw==="미분류")&&clearFile&&rules.some(rule=>rule.type_name==="문구"&&rule.keywords.some(k=>CLEAR_FILE.includes(normalizeTypeKeyword(k))&&title.includes(normalizeTypeKeyword(k)))))return "문구";
 if(raw&&raw!=="기타"&&raw!=="미분류")return Object.prototype.hasOwnProperty.call(aliases,normalized)?aliases[normalized]:raw;
 const classified=classifyTypeByKeywords(name,rules);
 return classified.matches.length?classified.type:raw||"미분류";
}
