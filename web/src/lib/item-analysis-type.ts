export type TypeKeywordRule={type_name:string;keywords:string[]};
// Shared business priority for independent keyword matches; compound product terms are resolved first.
export const DEFAULT_ANALYSIS_TYPES=["지류","피규어","인형","아크릴","뱃지","키링","마그넷","문구"];
export const normalizeTypeKeyword=(value:unknown)=>String(value??"").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"");
const aliases:Record<string,string>={poster:"지류",acrylicstand:"아크릴",acrylickeytag:"키링",keyholder:"키링",clearfile:"문구",랜깡:"랜덤박스"};
const fallback=(value:unknown)=>!String(value??"").trim()||["기타","미분류","미분류(키워드 충돌)"].includes(String(value).trim());
export function preferredRegisteredType(...values:unknown[]){
 return String(values.find(value=>!fallback(value))??values.find(value=>String(value??"").trim())??"기타").trim();
}
export function typeOptions(rules:TypeKeywordRule[]=[],extra:unknown[]=[]){
 return [...new Set([...DEFAULT_ANALYSIS_TYPES,...rules.map(r=>r.type_name),...extra.map(v=>String(v??"").trim()).filter(v=>v&&!fallback(v)&&v!=="전체"),"기타"])];
}
const titleText=(name:unknown)=>normalizeTypeKeyword(name).replace(/카드캡터|カードキャプター|cardcaptor|데스노트|デスノート/g,"");
// Product-specific exceptions take precedence even for previously entered broad categories.
function specialType(title:string,matches:string[]){
 const tests:[string,RegExp][]=[
  ["문구",/클리어파일|클리어화일|clearfile|クリアファイル|文件夹|資料夾/],
  ["지류",/코스터|coaster|コースター/],
  ["키링",/아크릴키링|아크릴키홀더|acrylickeyring|acrylickeychain|acrylickeytag|アクリルキーリング|アクリルキーホルダー|アクリルキータグ/],
  ["마그넷",/마그넷스티커|마그네트스티커|magnetsticker|マグネットステッカー/],
  ["문구",/마스코트.*(?:볼펜|샤프)|マスコット.*(?:ボールペン|シャープペン)/],
 ];
 return tests.find(([type,pattern])=>matches.includes(type)&&pattern.test(title))?.[0];
}
export function classifyTypeByKeywords(name:unknown,rules:TypeKeywordRule[]){
 const title=titleText(name);
 const hits=rules.flatMap(rule=>rule.keywords.map(normalizeTypeKeyword).filter(word=>word&&title.includes(word)).map(word=>({type:rule.type_name,word})));
 const specific=hits.filter(hit=>!hits.some(other=>other.type!==hit.type&&other.word.length>hit.word.length&&other.word.includes(hit.word)));
 const priority=typeOptions(rules);
 const matches=[...new Set(specific.map(hit=>hit.type))].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b));
 const special=specialType(title,[...new Set(hits.map(hit=>hit.type))]);
 return {type:special??matches[0]??"기타",matches,special};
}
export function resolveAnalysisType(name:unknown,registered:unknown,rules:TypeKeywordRule[]){
 const raw=String(registered??"").trim(),normalized=normalizeTypeKeyword(raw);
 if(normalized==="랜덤박스"||normalized==="랜깡")return "랜덤박스";
 const classified=classifyTypeByKeywords(name,rules);
 if(classified.special)return classified.special;
 if(!fallback(raw))return Object.prototype.hasOwnProperty.call(aliases,normalized)?aliases[normalized]:raw;
 return classified.type;
}
