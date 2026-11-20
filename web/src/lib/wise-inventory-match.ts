// Conservative matching. A recommendation never deducts a unit by itself.
export const normalizeProductName = (value: string) => String(value || "").normalize("NFKC").toLowerCase()
  .replace(/^\s*#\s*\d+\s*/, "").replace(/\s*#\s*\d+\s*$/, "").replace(/\s+/g, "").trim();
export const baseProductName = (value: string) => String(value || "").normalize("NFKC")
  .replace(/^\s*#\s*\d+\s*/, "").replace(/\s*#\s*\d+\s*$/, "").trim();
export const imageIdentity = (value: string | null) => String(value || "").trim().split("#")[0];

type SaleProductIdentity = {item_name:string;item_price:number;image_url:string|null;manual_series?:string|null};
export function saleProductKey(row:SaleProductIdentity):string {
  return JSON.stringify([normalizeProductName(row.item_name),row.item_price,imageIdentity(row.image_url),row.manual_series||""]);
}
// Identical product labels/photos can be reused for different items in later broadcasts.
export function saleBroadcastGroupKey(row:SaleProductIdentity&{video_id:string;id:string},listingId:string|null):string {
  return JSON.stringify([row.video_id||null,row.video_id&&listingId?"listing:"+listingId:"sale:"+row.id,normalizeProductName(row.item_name),row.item_price,row.manual_series||""]);
}

const series = [
  ["치이카와", /치이카와|먼작귀|치이|chiikawa|ちいかわ|吉伊卡哇/i],
  ["나히아", /나히아|나의\s*히어로|나의히어로|my\s*hero\s*academia|ヒーローアカデミア/i],
  ["헌터헌터", /헌헌|헌터\s*[×xX]?\s*헌터|hunter\s*[×xX]?\s*hunter|全职猎人/i],
  ["귀멸", /귀멸|demon\s*slayer|鬼滅|鬼灭/i],
  ["약사", /약사의?\s*혼잣말|薬屋|药屋/i],
  ["그비돌", /그\s*비스크|그비돌|着せ替え人形|dress.up.darling/i],
  ["프리렌", /프리렌|frieren|フリーレン/i],
  ["진격", /진격|attack\s*on\s*titan|進撃/i],
  ["짱구", /짱구|しんちゃん|crayon\s*shin/i],
  ["나루토", /나루토|naruto|ナルト/i],
  ["리락쿠마", /리락쿠마|rilakkuma|リラックマ/i],
  ["하이큐", /하이큐|haikyu|ハイキュー/i],
  ["코난", /코난|conan|コナン/i],
  ["드래곤볼", /드래곤\s*볼|dragon\s*ball|ドラゴンボール|七龙珠/i],
  ["디즈니", /디즈니|disney|ディズニー/i],
] as const;
const types = [
  ["카드", /포카|카드|card|トレカ|カード|收藏卡/i],
  ["씰", /씰|シール/i],
  ["스티커", /스티커|스티카|sticker|贴纸/i],
  ["아크릴", /아크릴|아크스타|acrylic|アクリル|亚克力/i],
  ["뱃지", /뱃지|배지|badge|缶バッジ|徽章/i],
  ["키링", /키링|키홀더|키체인|key\s*(ring|chain)|キーホルダー/i],
  ["피규어", /피규어|figure|フィギュア|公仔/i],
  ["봉제", /봉제|인형|마스코트|plush|ぬいぐるみ|毛绒/i],
  ["펜", /볼펜|젤펜|네임펜|샤프|펜|pen/i],
  ["엽서", /엽서|postcard|ポストカード/i],
  ["노트", /노트|수첩|notebook/i],
  ["파일", /파일|홀더|clear\s*file/i],
  ["캘린더", /캘린더|달력|calendar/i],
  ["마그넷", /마그넷|마그네트|자석|magnet|マグネット/i],
  ["브로마이드", /브로마이드|브로마이도|bromide|ブロマイド/i],
  ["포스터", /포스터|poster|ポスター/i],
  ["클립", /클립|clip|クリップ/i],
  ["파우치", /파우치|필통|pouch|ポーチ/i],
] as const;
function found(text:string, dictionary: readonly (readonly [string, RegExp])[]) { return dictionary.filter(([,re]) => re.test(text)).map(([label]) => label); }
const intersection = (a:string[],b:string[]) => a.some(x => b.includes(x));
const related = (a:string[],b:string[]) => a.some(x=>b.some(y=> (x==="씰"&&y==="스티커")||(x==="스티커"&&y==="씰")||(x==="피규어"&&y==="봉제")||(x==="봉제"&&y==="피규어")));
type KeywordCandidate = {name:string;option:string};
const genericWords=new Set(["랜덤","세트","세트상품","상품","굿즈","정품","공식","한정","한정판","특전","미니","빅","일반","개별","단품","박스","묶음","판매","신상","클리어","투명","컬렉션","시리즈","버전","버젼","오리지널","프리미엄","캐릭터","애니","애니메이션","기념","스페셜","일본","다섯개","두개","세개","네개","한개","개입","random","set","mini","box","goods","ver","version","special","limited","clear","collection"]);
const typeSuffixes=["피규어","아크릴스탠드","아크릴","캔뱃지","캔배지","뱃지","배지","스티커","키링","키홀더","카드","인형","마스코트","엽서","브로마이드","포스터","봉제","파우치"];
export function productKeywords(name:string):string[] {
  const words=baseProductName(name).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
  return [...new Set(words.map(word=>{
    const suffix=typeSuffixes.find(t=>word.endsWith(t)&&word.length-t.length>=2);
    return suffix?word.slice(0,-suffix.length):word;
  }).filter(word=>word.length>=2&&word.length<=40&&(!/^[a-z]+$/.test(word)||word.length>=3)&&!/^\d/.test(word)&&!genericWords.has(word)&&!found(word,series).length&&!found(word,types).length))];
}
function keywordText(candidate:KeywordCandidate){
  return normalizeProductName([candidate.name,candidate.option].join(" "));
}
// Use the recorded series tag (including custom series not in the regex
// dictionary) and normalize aliases such as 나히아/나의히어로아카데미아.
function canonicalSeries(value:string):string {
  const key=normalizeProductName(value).replace(/[\p{P}\p{S}]/gu,"");
  if(!key||["기타","미분류","키워드충돌","미분류키워드충돌","unknown","other"].includes(key))return "";
  const exact=series.find(([label])=>normalizeProductName(label)===key);
  return exact?.[0]||found(value,series)[0]||key;
}
function manualSeriesMatches(manual:string,candidate:{name:string;option:string;series:string}):boolean{
  const wanted=canonicalSeries(manual);
  if(!wanted)return false;
  const recorded=String(candidate.series||"").split(/[,/|·]/).map(canonicalSeries).filter(Boolean);
  if(recorded.length)return recorded.includes(wanted);
  const text=[candidate.name,candidate.option].join(" ");
  return found(text,series).includes(wanted)||normalizeProductName(text).replace(/[\p{P}\p{S}]/gu,"").includes(wanted);
}
// Count distinct product names/options so identical purchase lots do not make
// a distinctive character or collection name look more common than it is.
export function inventoryKeywordFrequency(saleName:string,candidates:readonly KeywordCandidate[]):Map<string,number>{
  const result=new Map<string,number>();
  const names=[...new Set(candidates.map(keywordText))];
  for(const keyword of productKeywords(saleName))result.set(keyword,names.filter(name=>name.includes(keyword)).length);
  return result;
}
export function recommendInventory(sale:{item_name:string; image_url:string|null;item_price:number;manual_series?:string|null}, candidate:{name:string;option:string;series:string;item_type?:string;image_url:string|null;sale_price:number|null;reference_prices?:number[];stock_status:string;random_member?:boolean}, frequency?:ReadonlyMap<string,number>) {
  const a = sale.item_name, b = [candidate.name,candidate.option,candidate.series,candidate.item_type].join(" ");
  const sa=found(a,series), sb=found(b,series), ta=found(a,types), tb=found(b,types);
  const manualSeries=String(sale.manual_series||"").trim();
  const manualMatch=Boolean(manualSeries)&&manualSeriesMatches(manualSeries,candidate);
  const sameSeries=!manualSeries&&intersection(sa,sb), sameType=intersection(ta,tb), nearType=related(ta,tb);
  const sameImage=Boolean(imageIdentity(sale.image_url))&&imageIdentity(sale.image_url)===imageIdentity(candidate.image_url);
  const sameName=normalizeProductName(a)===normalizeProductName(candidate.name);
  const matches=(frequency?[...frequency.keys()]:productKeywords(a)).filter(word=>keywordText(candidate).includes(word))
    .sort((x,y)=>(frequency?.get(x)||1)-(frequency?.get(y)||1)||y.length-x.length);
  const rarity=matches.length?Math.max(1,frequency?.get(matches[0])||1):0;
  const keywordScore=matches.length?2_000_000+Math.round(2_000_000/rarity)+Math.min(50_000,matches.length*5_000):0;
  // Strict priority: series, distinctive product keyword, kind, then actual
  // listed sale price. Rare keywords beat equally generic matches. A repeated-lot
  // group may have several different sale prices: compare its closest one.
  const prices=[candidate.sale_price,...(candidate.reference_prices||[])].filter((p):p is number=>typeof p==='number'&&Number.isFinite(p)&&p>0);
  const diff=sale.item_price>0&&prices.length?Math.min(...prices.map(p=>Math.abs(p-sale.item_price)/sale.item_price)):null;
  const nearPrice=diff!==null&&diff<=0.1000000001;
  const priceTier=nearPrice?2:diff!==null?1:0;
  const closeness=diff===null?0:Math.round(999/(1+diff))*10;
  const score=(manualMatch?100_000_000:sameSeries?10_000_000:0)+keywordScore+(sameType?200_000:nearType?100_000:0)+priceTier*10_000+closeness+(sameImage?4:0)+(sameName?2:0)+(candidate.random_member?0:1);
  const reasons=[manualMatch?"수동분류 작품 일치: "+manualSeries:sameSeries?"동일 작품":"",matches.length?"상품 키워드: "+matches.slice(0,3).join(", ")+(frequency?" (최소 "+rarity+"종 일치)":""):"",sameType?"동일 종류":nearType?"유사 종류":"",nearPrice?`판매가 ±10% (${(diff!*100).toFixed(1)}% 차이)`:"",sameImage?"동일 이미지":""].filter(Boolean);
  const reason=reasons.join(" · ");
  return {score,reason};
}
