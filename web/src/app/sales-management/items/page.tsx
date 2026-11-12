"use client";
import Link from "next/link";
import {resolveAnalysisSeries,type SeriesKeywordRule} from "@/lib/item-analysis-series";
import {DEFAULT_PRICING_SETTINGS} from "@/lib/pricing";
import {useEffect,useMemo,useState,type CSSProperties} from "react";
type Stock={id:string;order_number?:string;display_name?:string;product_name?:string;series_name?:string|null;item_type?:string|null;sale_price?:number|null;component_count?:number;purchase_quantity?:number;sold_quantity?:number;view_status?:string;stock_status?:string;ordered_at?:string|null;image_url?:string|null;internal_sku?:string|null;actual_purchase_currency?:string|null;actual_purchase_unit_price?:number|null};
type Item={id:string;name:string;series:string;type:string;price:number;count:number;boxes:number;qty:number;revenue:number;cost:number;net:number;profit:number|null;margin:number|null;purchaseAt:string|null;costKnown:boolean;sku:string;image:string|null;};
type Group={key:string;items:number;qty:number;revenue:number;profit:number;costCoverage:number;costRevenue:number;dateCount:number};
const cash=(v:number)=>Math.round(v).toLocaleString("ko-KR");
const percent=(n:number,d:number)=>d?(n/d*100).toFixed(1)+"%":"—";
// Only completed-inventory profit analytics use this cost: no pricing calculator fixed fees.
// Overseas: purchase price × exchange rate × import tax uplift (1.2).
// Domestic: purchase price as-is. Missing/unsupported prices remain unknown.
function completedAnalysisBoxCost(currencyRaw:string|null|undefined,unitPriceRaw:number|null|undefined):number|null{
 const unitPrice=Number(unitPriceRaw);
 if(unitPriceRaw==null||!Number.isFinite(unitPrice)||unitPrice<=0)return null;
 const currency=String(currencyRaw||"").toUpperCase().trim();
 if(currency==="KRW")return unitPrice;
 const rate=currency==="JPY"?DEFAULT_PRICING_SETTINGS.jpyRate:
  currency==="CNY"?DEFAULT_PRICING_SETTINGS.cnyRate:null;
 return rate===null?null:Math.round(unitPrice*rate*DEFAULT_PRICING_SETTINGS.importCostMultiplier);
}
// Display and group completed inventory by the original purchase date, not the completion timestamp.
const purchaseDay=(value:string):string|null=>{
 const raw=value.trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
  const date=new Date(raw+"T00:00:00.000Z");
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===raw?raw:null;
 }
 const date=new Date(raw);
 return Number.isNaN(date.getTime())?null:new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
};
const purchaseMonth=(s:string)=>s.slice(0,7);
const card:CSSProperties={background:"#fff",border:"1px solid #e2e8f0",borderRadius:13,padding:18};
const input:CSSProperties={border:"1px solid #cbd5e1",borderRadius:8,padding:"9px 10px",background:"#fff",color:"#0f172a"};
const th:CSSProperties={padding:"11px 12px",textAlign:"right",fontSize:12,color:"#64748b",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"};
const td:CSSProperties={padding:"11px 12px",textAlign:"right",borderBottom:"1px solid #f1f5f9",whiteSpace:"nowrap"};
const bands=[{name:"5천원 미만",min:0,max:5000},{name:"5천~1만원",min:5000,max:10000},{name:"1만~1.5만원",min:10000,max:15000},{name:"1.5만~2만원",min:15000,max:20000},{name:"2만~3만원",min:20000,max:30000},{name:"3만~5만원",min:30000,max:50000},{name:"5만원 이상",min:50000,max:Infinity}];
const bandFor=(price:number)=>bands.find(b=>price>=b.min&&price<b.max)?.name||"기타";
function convert(rows:Stock[],rules:SeriesKeywordRule[]){
 const stats={completed:0,withPrice:0,invalid:0,missingCost:0,missingPurchaseDate:0,excludedNoPrice:0};
 const items:Item[]=[];
 for(const row of rows){
  if(row.view_status!=="completed"&&row.stock_status!=="soldout")continue;
  stats.completed++;
  const price=Number(row.sale_price);
  if(row.sale_price===null||row.sale_price===undefined||!Number.isFinite(price)||price<=0){stats.excludedNoPrice++;continue;}
  stats.withPrice++;
  const count=Math.trunc(Number(row.component_count||0));
  const boxes=Math.trunc(Number(row.sold_quantity||row.purchase_quantity||0));
  if(count<=0||boxes<=0){stats.invalid++;continue;}
  const revenue=price*count*boxes;
  // Recalculate analysis-only cost from the actual recorded purchase price.
  // Never use box_cost_price here: it includes the pricing calculator's fixed fee.
  const boxCost=completedAnalysisBoxCost(row.actual_purchase_currency,row.actual_purchase_unit_price);
  const costKnown=boxCost!==null&&boxCost>0;
  if(!costKnown)stats.missingCost++;
  const cost=costKnown?boxCost*boxes:0;
  const net=revenue*.84;
  const profit=costKnown?net-cost:null;
  const purchased=typeof row.ordered_at==="string"?purchaseDay(row.ordered_at):null;
  if(!purchased)stats.missingPurchaseDate++;
  const itemName=String(row.display_name||row.product_name||"(이름 없음)");
  const classified=resolveAnalysisSeries([row.product_name,row.display_name].filter(Boolean).join(" "),row.series_name,rules);
  items.push({id:String(row.id),name:itemName,series:classified.series,type:String(row.item_type||"미분류"),price,count,boxes,qty:count*boxes,revenue,cost,net,profit,margin:profit!==null&&revenue>0?profit/revenue*100:null,purchaseAt:purchased,costKnown,sku:String(row.internal_sku||""),image:row.image_url||null});
 }
 return {items,stats};
}
function groups(items:Item[],key:(item:Item)=>string):Group[]{
 const map=new Map<string,Group>();
 for(const x of items){const k=key(x);const g=map.get(k)||{key:k,items:0,qty:0,revenue:0,profit:0,costCoverage:0,costRevenue:0,dateCount:0};g.items++;g.qty+=x.qty;g.revenue+=x.revenue;if(x.profit!==null){g.profit+=x.profit;g.costCoverage++;g.costRevenue+=x.revenue}if(x.purchaseAt)g.dateCount++;map.set(k,g);}
 return [...map.values()].sort((a,b)=>b.revenue-a.revenue);
}
function SalesBars({rows}:{rows:Group[]}){
 const peak=Math.max(1,...rows.map(x=>x.revenue));
 return <div style={{display:"grid",gap:10}}>
 {rows.slice(0,12).map(x=><div key={x.key}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,gap:10,marginBottom:4}}><b>{x.key}</b><span>{cash(x.revenue)}원 · {x.items}종</span></div><div style={{height:12,background:"#f1f5f9",borderRadius:7,overflow:"hidden"}}><div style={{width:(x.revenue/peak*100)+"%",height:"100%",background:"#0d9488",borderRadius:7}}/></div></div>)}
 {!rows.length&&<p style={{color:"#64748b",fontSize:13}}>표시할 데이터가 없어.</p>}
 </div>;
}
function SummaryTable({rows}:{rows:Group[]}){
 return <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["구분","완료 품목","판매 추정 수량","추정 매출","원가 확인 품목","확인 가능분 이익","확인 가능분 이익률"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.key}><td style={{...td,textAlign:"left",fontWeight:700}}>{x.key}</td><td style={td}>{x.items}종</td><td style={td}>{cash(x.qty)}개</td><td style={td}>{cash(x.revenue)}원</td><td style={td}>{x.costCoverage}/{x.items}</td><td style={td}>{x.costCoverage?cash(x.profit)+"원":"—"}</td><td style={td}>{x.costCoverage?percent(x.profit,x.costRevenue):"—"}</td></tr>)}</tbody></table></div>;
}
export default function ItemAnalysis(){
 const [rows,setRows]=useState<Stock[]>([]),[rules,setRules]=useState<SeriesKeywordRule[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [series,setSeries]=useState("전체"),[kind,setKind]=useState("전체"),[month,setMonth]=useState("전체"),[band,setBand]=useState("전체"),[search,setSearch]=useState(""),[sort,setSort]=useState("revenue"),[limit,setLimit]=useState(60);
 useEffect(()=>{let active=true;Promise.all([fetch("/api/sale-inventory",{cache:"no-store"}),fetch("/api/sales-management/item-keywords",{cache:"no-store"})]).then(async ([inventory,keywords])=>{const a=await inventory.json(),b=await keywords.json();if(!inventory.ok||!a.ok)throw Error(a.message||"판매재고 조회 실패");if(!keywords.ok||!b.ok)throw Error(b.message||"키워드 조회 실패");if(active){setRows(a.items||[]);setRules(b.rules||[])}}).catch(e=>{if(active)setError(String(e.message||e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const {items,stats}=useMemo(()=>convert(rows,rules),[rows,rules]);
 const seriesList=[...new Set(items.map(x=>x.series))].sort((a,b)=>a.localeCompare(b,"ko"));
 const kindList=[...new Set(items.map(x=>x.type))].sort((a,b)=>a.localeCompare(b,"ko"));
 const monthList=[...new Set(items.map(x=>x.purchaseAt?purchaseMonth(x.purchaseAt):"날짜 없음"))].sort().reverse();
 const filtered=useMemo(()=>items.filter(x=>(series==="전체"||x.series===series)&&(kind==="전체"||x.type===kind)&&(month==="전체"||(x.purchaseAt?purchaseMonth(x.purchaseAt):"날짜 없음")===month)&&(band==="전체"||bandFor(x.price)===band)&&(!search||[x.name,x.sku,x.series,x.type].join(" ").toLowerCase().includes(search.toLowerCase()))),[items,series,kind,month,band,search]);
 const total=filtered.reduce((s,x)=>s+x.revenue,0),qty=filtered.reduce((s,x)=>s+x.qty,0);
 const costed=filtered.filter(x=>x.profit!==null),costedRevenue=costed.reduce((s,x)=>s+x.revenue,0),costedProfit=costed.reduce((s,x)=>s+(x.profit||0),0),costedCost=costed.reduce((s,x)=>s+x.cost,0);
 const sorted=[...filtered].sort((a,b)=>sort==="profit"?(b.profit??-Infinity)-(a.profit??-Infinity):sort==="margin"?(b.margin??-Infinity)-(a.margin??-Infinity):sort==="price"?b.price-a.price:sort==="recent"?String(b.purchaseAt||"").localeCompare(String(a.purchaseAt||"")):b.revenue-a.revenue);
 const bySeries=groups(filtered,x=>x.series),byType=groups(filtered,x=>x.type),byPrice=groups(filtered,x=>bandFor(x.price));
 const byMonth=groups(filtered.filter(x=>x.purchaseAt!==null),x=>purchaseMonth(x.purchaseAt!)).sort((a,b)=>a.key.localeCompare(b.key));
 const firstDate=items.map(x=>x.purchaseAt).filter((date):date is string=>Boolean(date)).sort()[0];
 return <main style={{maxWidth:1450,margin:"auto",padding:"24px 20px 70px",color:"#0f172a"}}>
  <header style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
   <div><div style={{color:"#64748b",fontSize:12}}>매출관리 / 아이템 분석</div><h1 style={{fontSize:29,margin:"5px 0"}}>작품 · 굿즈 · 가격대별 판매 분석</h1><p style={{fontSize:13,color:"#64748b",margin:0}}>방송판매 재고의 완료 처리 기록을 기반으로 한 추정 매출과 이익</p></div>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/sales-management" style={input}>← 매출관리</Link><Link href="/sale-inventory" style={input}>방송판매 재고</Link><Link href="/sales-management/items/keywords" style={{...input,background:"#eff6ff",borderColor:"#93c5fd",fontWeight:700}}>작품 키워드 관리</Link></div>
  </header>
  {loading&&<div style={card}>판매재고 데이터를 읽어오는 중…</div>}
  {error&&<div style={{...card,color:"#b91c1c"}} role="alert">{error}</div>}
  {!loading&&!error&&<>
   <div style={{...card,background:"#f8fafc",marginBottom:16,fontSize:13,lineHeight:1.8}}><b>작품 분류:</b> <Link href="/sales-management/items/keywords">키워드 관리</Link>에서 등록한 단어로 상품명을 판별하며, 일치하지 않으면 기존 저장 작품명을 사용해. 여러 작품 키워드가 동시에 일치하면 원본 작품명을 유지하거나 미분류로 표시해. 실제 상품·매입 데이터는 수정하지 않아.</div>
   <div style={{...card,background:"#f8fafc",marginBottom:16,fontSize:13,lineHeight:1.8}}><b>분석 기준:</b> 방송판매 재고에서 완료 상태이고 개당 판매가가 입력된 품목 중, 박스 구성수량과 판매 박스 수가 확인되는 항목을 집계해. <b>완료 시 재고 전체가 판매 처리되는 현행 시스템 규칙</b>에 따라 실제 결제 확정 매출과 다를 수 있어. <b>이익 = 추정 매출 × 0.84 − 분석 원가</b>이며, <b>분석 원가 = 국내 상품 매입가 그대로 / 해외 상품 매입가 × 기준환율 × 1.2</b>야. 판매가 계산기의 가상 고정비는 완료건 분석에서 제외해. 0.84는 현행 방송판매 재고 화면의 수수료·세금 단순 가정이야. 실제 세무상 순이익이나 정산 금액은 아니야. 원가 누락 품목은 이익률에서 제외해. <b>월별 필터와 추세, 정렬, 상세 날짜는 실제 매입일을 기준으로 하고 완료일은 집계 날짜에 사용하지 않아.</b></div>
   <section style={{...card,display:"flex",gap:10,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
    <label>작품 <select style={input} value={series} onChange={e=>setSeries(e.target.value)}><option>전체</option>{seriesList.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>굿즈 유형 <select style={input} value={kind} onChange={e=>setKind(e.target.value)}><option>전체</option>{kindList.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>판매가 <select style={input} value={band} onChange={e=>setBand(e.target.value)}><option>전체</option>{bands.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
    <label>매입 월 <select style={input} value={month} onChange={e=>setMonth(e.target.value)}><option>전체</option>{monthList.map(x=><option key={x}>{x}</option>)}</select></label>
    <input aria-label="아이템 검색" placeholder="상품명 / 관리번호 검색" style={{...input,flex:"1 1 210px"}} value={search} onChange={e=>{setSearch(e.target.value);setLimit(60)}}/>
    <button style={input} onClick={()=>{setSeries("전체");setKind("전체");setBand("전체");setMonth("전체");setSearch("")}}>초기화</button>
   </section>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:16}}>
    {[
     ["분석 대상",cash(filtered.length)+"종",cash(qty)+"개 판매 처리"],
     ["추정 판매매출",cash(total)+"원","완료 재고 × 입력 판매가"],
     ["원가 확인 품목",costed.length+"/"+filtered.length+"종","원가 누락은 이익에서 제외"],
     ["원가 확인분 매출",cash(costedRevenue)+"원","이익 계산 가능 매출"],
     ["확인 가능분 추정 이익",costed.length?cash(costedProfit)+"원":"—","매출×0.84 − 분석 원가"],
     ["확인 가능분 이익률",costed.length?percent(costedProfit,costedRevenue):"—",cash(costedCost)+"원 원가 반영"]
    ].map(([a,b,c])=><div style={card} key={a}><div style={{fontSize:12,color:"#64748b"}}>{a}</div><div style={{fontSize:23,fontWeight:800,margin:"10px 0 5px"}}>{b}</div><div style={{fontSize:12,color:"#64748b"}}>{c}</div></div>)}
   </section>
   <section style={{...card,marginBottom:16,fontSize:12,color:"#64748b",lineHeight:1.7}}>전체 원본: 완료 {stats.completed}종 · 판매가 없는 완료 {stats.excludedNoPrice}종 · 구성수량/박스수 미확인 {stats.invalid}종 · 원가 미확인 {stats.missingCost}종 · 매입일 없음 {stats.missingPurchaseDate}종. 원가 미확인 품목을 0원 원가로 간주하지 않아.</section>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,495px),1fr))",gap:16,marginBottom:16}}>
    <section style={card}><h2 style={{fontSize:18}}>작품별 매출</h2><SalesBars rows={bySeries}/></section>
    <section style={card}><h2 style={{fontSize:18}}>굿즈 유형별 매출</h2><SalesBars rows={byType}/></section>
    <section style={card}><h2 style={{fontSize:18}}>판매가격대별 매출</h2><p style={{fontSize:12,color:"#64748b"}}>입력한 개당 판매가를 기준으로 구분해.</p><SalesBars rows={byPrice}/></section>
    <section style={card}><h2 style={{fontSize:18}}>매입 월별 완료 상품 추정 매출</h2><p style={{fontSize:12,color:"#64748b"}}>완료 처리된 재고의 추정 판매매출을 실제 매입일 기준 월에 배분해. 완료 처리일이나 실제 판매일 기준이 아니며, 매입일이 없는 항목은 월별 추세에서 제외돼.</p><SalesBars rows={byMonth}/>{firstDate&&<p style={{fontSize:11,color:"#64748b"}}>기록된 가장 이른 매입일: {firstDate}</p>}</section>
   </div>
   <section style={{...card,marginBottom:16}}><h2 style={{fontSize:18}}>작품별 수익 비교</h2><SummaryTable rows={bySeries}/></section>
   <section style={{...card,marginBottom:16}}><h2 style={{fontSize:18}}>굿즈 유형별 수익 비교</h2><SummaryTable rows={byType}/></section>
   <section style={{...card,marginBottom:16}}><h2 style={{fontSize:18}}>판매가격대별 수익 비교</h2><SummaryTable rows={byPrice}/></section>
   <section style={card}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><h2 style={{fontSize:18}}>아이템별 상세</h2><label>정렬 <select style={input} value={sort} onChange={e=>setSort(e.target.value)}><option value="revenue">매출 높은 순</option><option value="profit">추정 이익 높은 순</option><option value="margin">추정 이익률 높은 순</option><option value="price">개당 판매가 높은 순</option><option value="recent">최근 매입 순</option></select></label></div>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["상품","작품","유형","판매가/개","박스 구성","완료 박스","추정 매출","분석 원가","추정 이익","추정 이익률","매입일"].map(x=><th style={th} key={x}>{x}</th>)}</tr></thead><tbody>{sorted.slice(0,limit).map(x=><tr key={x.id}><td style={{...td,textAlign:"left",minWidth:200,whiteSpace:"normal"}}><div style={{display:"flex",gap:9,alignItems:"center"}}>{x.image&&<img src={x.image} alt="" style={{width:38,height:38,objectFit:"contain",borderRadius:5}}/>}<div><b>{x.name}</b>{x.sku&&<div style={{fontSize:10,color:"#94a3b8",wordBreak:"break-all"}}>{x.sku}</div>}</div></div></td><td style={td}>{x.series}</td><td style={td}>{x.type}</td><td style={td}>{cash(x.price)}원</td><td style={td}>{x.count}개</td><td style={td}>{x.boxes}박스</td><td style={td}>{cash(x.revenue)}원</td><td style={td}>{x.costKnown?cash(x.cost)+"원":"미확인"}</td><td style={{...td,color:x.profit!==null&&x.profit<0?"#dc2626":"inherit"}}>{x.profit===null?"—":cash(x.profit)+"원"}</td><td style={td}>{x.margin===null?"—":x.margin.toFixed(1)+"%"}</td><td style={td}>{x.purchaseAt||"—"}</td></tr>)}</tbody></table></div>
    <div style={{fontSize:12,color:"#64748b",marginTop:12}}>{sorted.length}종 중 {Math.min(limit,sorted.length)}종 표시 {limit<sorted.length&&<button style={{...input,marginLeft:10}} onClick={()=>setLimit(v=>v+60)}>60종 더 보기</button>}</div>
   </section>
  </>}
 </main>;
}
