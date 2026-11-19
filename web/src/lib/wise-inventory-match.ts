// Conservative matching. A recommendation never deducts a unit by itself.
export const normalizeProductName = (value: string) => String(value || "").normalize("NFKC").toLowerCase()
  .replace(/^\s*#\s*\d+\s*/, "").replace(/\s*#\s*\d+\s*$/, "").replace(/\s+/g, "").trim();
export const baseProductName = (value: string) => String(value || "").normalize("NFKC")
  .replace(/^\s*#\s*\d+\s*/, "").replace(/\s*#\s*\d+\s*$/, "").trim();
export const imageIdentity = (value: string | null) => String(value || "").trim().split("#")[0];

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
] as const;
function found(text:string, dictionary: readonly (readonly [string, RegExp])[]) { return dictionary.filter(([,re]) => re.test(text)).map(([label]) => label); }
const intersection = (a:string[],b:string[]) => a.some(x => b.includes(x));
const related = (a:string[],b:string[]) => a.some(x=>b.some(y=> (x==="씰"&&y==="스티커")||(x==="스티커"&&y==="씰")||(x==="피규어"&&y==="봉제")||(x==="봉제"&&y==="피규어")));
export function recommendInventory(sale:{item_name:string; image_url:string|null;item_price:number}, candidate:{name:string;option:string;series:string;item_type?:string;image_url:string|null;sale_price:number|null;stock_status:string;random_member?:boolean}) {
  const a = sale.item_name, b = [candidate.name,candidate.option,candidate.series,candidate.item_type].join(" ");
  const sa=found(a,series), sb=found(b,series), ta=found(a,types), tb=found(b,types);
  const sameSeries=intersection(sa,sb), sameType=intersection(ta,tb), nearType=related(ta,tb);
  const sameImage=Boolean(imageIdentity(sale.image_url))&&imageIdentity(sale.image_url)===imageIdentity(candidate.image_url);
  const sameName=normalizeProductName(a)===normalizeProductName(candidate.name);
  const price=candidate.sale_price==null?0:Math.max(0,8-Math.abs(candidate.sale_price-sale.item_price)/Math.max(1,sale.item_price)*8);
  const tier=sameSeries&&sameType?400:sameSeries&&nearType?300:sameSeries&&sameImage?250:sameSeries?200:sameImage?150:sameType?100:0;
  const score=tier+(sameImage?25:0)+(sameName?20:0)+price-(candidate.random_member?2:0);
  const reason=sameSeries&&sameType?"동일 작품 · 상품 키워드":sameSeries&&nearType?"동일 작품 · 유사 키워드":sameSeries?"동일 작품":sameImage?"동일 이미지":sameType?"동일 상품 키워드":"";
  return {score,reason};
}
