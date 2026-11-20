// Read-only analysis: order commitments, physical stock and actual linked sales
// are separate measures. A missing cost is never treated as free inventory.
import { resolveAnalysisType, type TypeKeywordRule } from "./item-analysis-type";
import { DEFAULT_PRICING_SETTINGS } from "./pricing";
import { effectiveSaleUnits } from "./sale-units";
import { resolveAnalysisSeries, type SeriesKeywordRule } from "./item-analysis-series";

const rates:Record<string,number>={KRW:1,JPY:DEFAULT_PRICING_SETTINGS.jpyRate,CNY:DEFAULT_PRICING_SETTINGS.cnyRate};
const retention=DEFAULT_PRICING_SETTINGS.salesRetentionRate;
const DAY=86400000;
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const qty=(v:unknown)=>Math.max(0,Math.trunc(num(v)));
const currency=(v:unknown)=>String(v||"").trim().toUpperCase();
const validCost=(v:unknown)=>v!=null&&num(v)>0;
const isDuplicate=(o:any)=>Boolean(o.raw_data?.simple_merged_into||(o.raw_data?.simple_purchase===true&&o.raw_data?.purchase_registered===true));
export const isPurchaseIncluded=(o:any)=>!isDuplicate(o)&&!['취소','환불','구매취소'].includes(String(o.order_status||""));
export function purchaseDay(value:unknown):string|null{
 const s=String(value||"");if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const d=new Date(s);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(d):null;
}
const daysBetween=(start:string|null,end:string|null):number|null=>{
 if(!start||!end)return null;const d=(Date.parse(end)-Date.parse(start))/DAY;return Number.isFinite(d)&&d>=0?d:null;
};
export function analysisBoxCost(price:unknown,currencyRaw:unknown):number|null{
 const c=currency(currencyRaw);if(!validCost(price)||!(c in rates))return null;
 return num(price)*rates[c]*(c==="KRW"?1:DEFAULT_PRICING_SETTINGS.importCostMultiplier);
}
export function orderCapital(o:any){
 const c=currency(o.raw_data?.payment_currency||o.currency),rate=rates[c];
 const amount=num(o.paid_amount),second=num(o.local_shipping),first=o.raw_data?.first_payment;
 const confirmed=o.raw_data?.invoice_total_confirmed===true;
 const isForeign=currency(o.currency)!=="KRW";
 if(!rate||o.paid_amount==null||amount<=0)return {cost:null,confirmedKrw:0,estimated:true};
 const secondIncluded=confirmed&&(first==null||String(first).trim()===""||amount>=num(first)+second-.01);
 const extraSecond=o.raw_data?.second_payment_confirmed===true&&second>0&&!secondIncluded?second*rate:0;
 const base=amount*rate*((confirmed||!isForeign||c==="KRW")?1:DEFAULT_PRICING_SETTINGS.importCostMultiplier);
 const shipping=isForeign&&second<=0?50000:0;
 return {cost:base+extraSecond+shipping,confirmedKrw:confirmed&&c==="KRW"?amount+extraSecond:0,estimated:!confirmed||c!=="KRW"||shipping>0};
}
export type InvestmentLot={id:string;name:string;series:string;kind:string;date:string|null;age:number|null;totalUnits:number;remaining:number;unitCost:number|null;invested:number|null;remainingCost:number|null;price:number|null;potential:number|null;linkedUnits:number;linkedRevenue:number;costedRevenue:number;costOfSales:number;profit:number|null;weightedDays:number;datedUnits:number;soldThrough:number|null;image:string|null;sku:string;random:boolean};
export type InvestmentSale={id:string;item_name:string;item_price:number;actual_sale_units?:number|null;sold_at?:string|null;ordered_at?:string|null};
export type InvestmentLink={wise_stock_id:string|number;purchase_item_id?:string|null;random_box_id?:string|null;inventory_group_id?:string|null;quantity:number;group_allocations?:{lot_id:string;units:number}[]|null};
export type InvestmentOrder={id:string;status:string;date:string|null;shop:string;number:string;units:number;products:number;cost:number|null;confirmedKrw:number;estimated:boolean;series:string[]};
export type InvestmentReport={asOf:string;orders:InvestmentOrder[];lots:InvestmentLot[];coverage:{sales:number;revenue:number;linked:number;linkedRevenue:number;costed:number;costedRevenue:number;costedCost:number;profit:number;unallocatedGroup:number;multiTarget:number;missingCost:number;quantityMismatch:number;unlinked:number};excludedOrders:number};

export function buildInvestmentReport(input:{orders:any[];inventory:any[];boxes:any[];sales:InvestmentSale[];links:InvestmentLink[];rules:SeriesKeywordRule[];typeRules?:TypeKeywordRule[];excludedKeywords:string[];deletedIds:string[];now:string}):InvestmentReport{
 const activeOrders=input.orders.filter(isPurchaseIncluded),activeIds=new Set(activeOrders.map(o=>String(o.id)));
 const orders:InvestmentOrder[]=activeOrders.map(o=>{
  const p=orderCapital(o);const items=o.purchase_items||[];
  return {id:String(o.id),status:String(o.order_status||"주문완료"),date:purchaseDay(o.ordered_at),shop:String(o.shop_name||o.source_site||""),number:String(o.order_number||""),units:items.reduce((s:number,i:any)=>s+qty(i.quantity)*Math.max(1,qty(i.component_count)),0),products:items.length,cost:p.cost,confirmedKrw:p.confirmedKrw,estimated:p.estimated,series:[...new Set<string>(items.map((i:any)=>resolveAnalysisSeries(String(i.display_name_ko||i.product_name||""),i.series_name??i.inventory_items?.series_name,input.rules).series))]};
 });
 const asOf=purchaseDay(input.now)||input.now;
 const rows=[...input.inventory.filter(i=>!i.is_random_member&&activeIds.has(String(i.order_id))),...input.boxes];
 const lots:InvestmentLot[]=rows.map(i=>{
  const random=Boolean(i.is_random_box),totalUnits=qty(i.purchase_quantity)*Math.max(1,qty(i.component_count));
  const remaining=i.view_status==="completed"||i.stock_status==="soldout"?0:qty(i.remaining_units);
  const count=Math.max(1,qty(i.component_count));
  // Random pools have a recorded composition cost; use member purchase prices
  // excluding pricing-only fees when the underlying recorded quantities reconcile.
  let boxCost=analysisBoxCost(i.actual_purchase_unit_price,i.actual_purchase_currency);
  if(random){
   const members=Array.isArray(i.members)?i.members:[];
   const costs=members.map((m:any)=>({cost:analysisBoxCost(m.unit_purchase_price,m.currency),boxes:qty(m.original_box_quantity),units:qty(m.original_box_quantity)*Math.max(1,qty(m.component_count))}));
   if(costs.length&&costs.every((m:any)=>m.cost!==null)&&costs.reduce((s:number,m:any)=>s+m.units,0)===totalUnits&&totalUnits>0)boxCost=costs.reduce((s:number,m:any)=>s+m.cost*m.boxes,0)/Math.max(1,qty(i.purchase_quantity));
   else boxCost=validCost(i.box_cost_price)?num(i.box_cost_price):null;
  }
  const unitCost=boxCost===null?null:boxCost/count;
  const price=validCost(i.sale_price)?num(i.sale_price):null;
  const date=purchaseDay(i.ordered_at);const name=String(i.display_name||i.product_name||"(상품명 없음)");
  const series=random&&Array.isArray(i.series_tags)&&i.series_tags.length>1?"혼합 랜덤박스":resolveAnalysisSeries(name,i.series_name,input.rules).series;
  return {id:String(i.id),name,series,kind:random?"랜덤박스":resolveAnalysisType([i.product_name,i.display_name,i.option_text,i.sourcing_item_name].filter(Boolean).join(" "),i.item_type,input.typeRules||[]),date,age:daysBetween(date,asOf),totalUnits,remaining,unitCost,invested:unitCost===null?null:unitCost*totalUnits,remainingCost:unitCost===null?null:unitCost*remaining,price,potential:price===null?null:price*remaining,linkedUnits:0,linkedRevenue:0,costedRevenue:0,costOfSales:0,profit:null,weightedDays:0,datedUnits:0,soldThrough:totalUnits>0?Math.max(0,Math.min(100,100*(totalUnits-remaining)/totalUnits)):null,image:i.image_url||null,sku:String(i.internal_sku||""),random};
 });
 const byId=new Map(lots.map(l=>[l.id,l])),linksById=new Map<string,InvestmentLink[]>();
 for(const l of input.links){const id=String(l.wise_stock_id);linksById.set(id,[...(linksById.get(id)||[]),l]);}
 const deleted=new Set(input.deletedIds),terms=input.excludedKeywords.map(x=>x.toLowerCase()).filter(Boolean);
 const coverage={sales:0,revenue:0,linked:0,linkedRevenue:0,costed:0,costedRevenue:0,costedCost:0,profit:0,unallocatedGroup:0,multiTarget:0,missingCost:0,quantityMismatch:0,unlinked:0};
 for(const s of input.sales){
  if(deleted.has(String(s.id))||terms.some(t=>String(s.item_name||"").normalize("NFKC").toLowerCase().includes(t)))continue;
  const revenue=num(s.item_price);if(revenue<0)continue;
  coverage.sales++;coverage.revenue+=revenue;
  const links=linksById.get(String(s.id))||[];
  if(!links.length){coverage.unlinked++;continue;}
  coverage.linked++;coverage.linkedRevenue+=revenue;
  if(links.length!==1){coverage.multiTarget++;continue;}
  const link=links[0],units=qty(link.quantity);
  if(!units||units!==effectiveSaleUnits(s.actual_sale_units,links)){coverage.quantityMismatch++;continue;}
  const alloc=link.inventory_group_id?(link.group_allocations||[]):[{lot_id:String(link.purchase_item_id||link.random_box_id||""),units}];
  if(link.inventory_group_id&&alloc.reduce((n,a)=>n+qty(a.units),0)!==units){coverage.unallocatedGroup++;continue;}
  const targets=alloc.map(a=>({lot:byId.get(String(a.lot_id)),units:qty(a.units)}));
  // Revenue is split only among FIFO lots of the *same* inventory group.
  // Multi-product bundles have no recorded per-product revenue split.
  if(targets.some(a=>!a.lot||!a.units)){coverage.missingCost++;continue;}
  for(const a of targets){const l=a.lot!;l.linkedUnits+=a.units;l.linkedRevenue+=revenue*a.units/units;const days=daysBetween(l.date,purchaseDay(s.sold_at||s.ordered_at));if(days!==null){l.weightedDays+=days*a.units;l.datedUnits+=a.units;}}
  if(targets.some(a=>a.lot!.unitCost===null)){coverage.missingCost++;continue;}
  coverage.costed++;coverage.costedRevenue+=revenue;
  for(const a of targets){const l=a.lot!,part=revenue*a.units/units,cost=l.unitCost!*a.units;l.costedRevenue+=part;l.costOfSales+=cost;l.profit=(l.profit||0)+part*retention-cost;coverage.costedCost+=cost;}
 }
 coverage.profit=coverage.costedRevenue*retention-coverage.costedCost;
 return {asOf,orders,lots,coverage,excludedOrders:input.orders.length-activeOrders.length};
}
