"use client";
import Link from "next/link";
import {analysisSeriesForSale,type SeriesKeywordRule} from "@/lib/item-analysis-series";
import {useEffect,useMemo,useState,type CSSProperties} from "react";
type Sale={id:string;order_id:string;buyer_nickname:string;item_price:number;item_name:string;ordered_at:string;sold_at?:string|null;video_id?:string|null;image_url?:string|null};
type Report={ok:boolean;message?:string;all_time_sales_rows:Sale[];settings?:{item_settings?:{id:string;deleted:boolean}[]}};
type Entry={id:string;order:string;video:string|null;amount:number;at:number;name:string;series:string};
type Buyer={key:string;name:string;entries:Entry[];videos:Set<string>;orders:Set<string>;first:number;last:number;total:number;events:number[];second:number|null};
const won=(n:number)=>Math.round(n).toLocaleString("ko-KR");
const normalize=(s:string)=>s.normalize("NFKC").replace(/\s+/g,"").trim().toLowerCase();
const day=(t:number)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(t);
const panel:CSSProperties={padding:18,border:"1px solid #e2e8f0",borderRadius:14,background:"#fff"};
const control:CSSProperties={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:8,background:"#fff",color:"#0f172a"};
const head:CSSProperties={textAlign:"right",padding:"11px 12px",fontSize:12,color:"#64748b",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"};
const cell:CSSProperties={textAlign:"right",padding:"11px 12px",borderBottom:"1px solid #f1f5f9",whiteSpace:"nowrap"};
function buyerFromEntries(key:string,name:string,entries:Entry[]):Buyer{
 const events=new Map<string,number>();
 for(const e of entries){
  const eventKey=e.video?"broadcast:"+e.video:"order:"+e.order;
  events.set(eventKey,Math.min(events.get(eventKey)??Infinity,e.at));
 }
 const times=[...events.values()].sort((a,b)=>a-b);
 return {key,name,entries,videos:new Set(entries.map(e=>e.video).filter((x):x is string=>Boolean(x))),orders:new Set(entries.map(e=>e.order)),first:entries[0].at,last:entries[entries.length-1].at,total:entries.reduce((sum,e)=>sum+e.amount,0),events:times,second:times[1]??null};
}
function scopeCustomers(buyers:Buyer[],startDate:string,endDate:string):Buyer[]{
 if(!startDate&&!endDate)return buyers;
 if(startDate&&endDate&&startDate>endDate)return [];
 const start=startDate?Date.parse(startDate+"T00:00:00+09:00"):-Infinity;
 const end=endDate?Date.parse(endDate+"T23:59:59.999+09:00"):Infinity;
 return buyers.flatMap(buyer=>{
  const entries=buyer.entries.filter(e=>e.at>=start&&e.at<=end);
  return entries.length?[buyerFromEntries(buyer.key,buyer.name,entries)]:[];
 }).sort((a,b)=>b.total-a.total);
}
function monthEnd(month:string){
 const [year,number]=month.split("-").map(Number);
 return month+"-"+String(new Date(Date.UTC(year,number,0)).getUTCDate()).padStart(2,"0");
}
function customersFrom(rows:Sale[],deleted:Set<string>,rules:SeriesKeywordRule[],overrides:Record<string,string>){
 const grouped=new Map<string,{name:string;entries:Entry[]}>();
 for(const r of rows){
  if(deleted.has(String(r.id)))continue;
  const name=String(r.buyer_nickname||"").trim();
  if(!name||name==="(닉네임 없음)")continue;
  const at=Date.parse(r.sold_at||r.ordered_at);
  if(!Number.isFinite(at))continue;
  const key=normalize(name),group=grouped.get(key)||{name,entries:[]};
  group.entries.push({id:String(r.id),order:String(r.order_id),video:r.video_id||null,amount:Number(r.item_price)||0,at,name:r.item_name,series:analysisSeriesForSale(r.item_name,r.image_url,rules,overrides)});
  grouped.set(key,group);
 }
 const all:Buyer[]=[];
 for(const [key,value] of grouped){
  const entries=value.entries.sort((a,b)=>a.at-b.at);
  all.push(buyerFromEntries(key,value.name,entries));
 }
 return all.sort((a,b)=>b.total-a.total);
}
const percent=(n:number,d:number)=>d?(100*n/d).toFixed(1)+"%":"—";

type Favorite={series:string;amount:number;count:number};
function topSeries(entries:Entry[]):Favorite[]{
 const groups=new Map<string,Favorite>();
 for(const e of entries){
  const series=e.series;if(!series||series==="미분류"||series==="키워드 충돌"||series==="기타")continue;
  const row=groups.get(series)||{series,amount:0,count:0};
  row.amount+=e.amount;row.count++;groups.set(series,row);
 }
 return [...groups.values()].sort((a,b)=>b.amount-a.amount||b.count-a.count||a.series.localeCompare(b.series,"ko")).slice(0,3);
}
const FAVORITE_STYLES:CSSProperties[]=[
 {background:"#fff2c9",border:"1px solid #f3c66a",color:"#925600"},
 {background:"#edf0f8",border:"1px solid #c7cfe2",color:"#475569"},
 {background:"#ffede2",border:"1px solid #eab79c",color:"#9a532c"}
];
function FavoriteBadges({entries}:{entries:Entry[]}){
 const favorites=topSeries(entries);
 return <span style={{display:"inline-flex",gap:4,flexWrap:"wrap",alignItems:"center",marginLeft:8,verticalAlign:"middle"}}>
 {favorites.map((x,i)=><span key={x.series} title={(i+1)+"위 · "+x.series+" · "+won(x.amount)+"원 · "+x.count+"개"} style={{...FAVORITE_STYLES[i],borderRadius:999,padding:"3px 7px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{["🥇","🥈","🥉"][i]} {x.series}</span>)}
 </span>;
}


type Lifecycle={buyer:Buyer;bins:number[];ageDays:number;idleDays:number;stage:string;earlyShare:number;observed60:boolean;observed90:boolean};
function buildLifecycle(buyers:Buyer[],asOf:number):Lifecycle[]{
 const highCutoff=[...buyers].sort((a,b)=>b.total-a.total)[Math.max(0,Math.ceil(buyers.length*0.2)-1)]?.total??Infinity;
 return buyers.map(buyer=>{
  const bins=[0,0,0,0];for(const e of buyer.entries){const age=(e.at-buyer.first)/86400000;bins[Math.min(3,Math.max(0,Math.floor(age/30)))]+=e.amount;}
  const ageDays=Math.floor(Math.max(0,asOf-buyer.first)/86400000),idleDays=Math.floor(Math.max(0,asOf-buyer.last)/86400000);
  const earlyShare=buyer.total>0?bins[0]/buyer.total:0;
  const high=buyer.total>=highCutoff&&buyer.total>0;
  let stage="관찰 중";
  if(ageDays<30)stage=high?"최근 유입 큰손":"최근 유입";
  else if(ageDays>=90&&bins[1]>0&&bins[2]>0)stage="지속 구매형";
  else if(ageDays>=60&&high&&earlyShare>=0.75&&bins[1]<bins[0]*0.3)stage="초반 집중형";
  else if(ageDays>=60&&idleDays>=30)stage="30일 이상 미구매";
  else if(ageDays>=30&&high&&earlyShare>=0.75)stage="초반 집중 관찰";
  else if(ageDays>=60&&bins[1]>0)stage="재구매 유지";
  return {buyer,bins,ageDays,idleDays,stage,earlyShare,observed60:ageDays>=60,observed90:ageDays>=90};
 });
}

function monthlyCustomerRows(all:Buyer[],active:Buyer[],months:string[]){
  const firstByKey=new Map(all.map(c=>[c.key,c.first]));
  return months.flatMap(m=>{
   const buyers=active.filter(c=>c.entries.some(e=>day(e.at).startsWith(m)));
   if(!buyers.length)return [];
   const newBuyers=buyers.filter(c=>c.first===firstByKey.get(c.key)&&day(c.first).startsWith(m));
   const newKeys=new Set(newBuyers.map(c=>c.key));
   const revenue=buyers.reduce((a,c)=>a+c.entries.filter(e=>day(e.at).startsWith(m)).reduce((s,e)=>s+e.amount,0),0);
   const returningRevenue=buyers.filter(c=>!newKeys.has(c.key)).reduce((a,c)=>a+c.entries.filter(e=>day(e.at).startsWith(m)).reduce((s,e)=>s+e.amount,0),0);
   return [{m,buyers:buyers.length,newBuyers:newBuyers.length,returning:buyers.length-newBuyers.length,revenue,returningRevenue}];
  });
}
function retentionFor(buyers:Buyer[],asOf:number,days:number){
 const cutoff=days*86400000;
 const eligible=buyers.filter(c=>c.first+cutoff<=asOf);
 const returned=eligible.filter(c=>c.second!==null&&c.second<=c.first+cutoff&&c.second>c.first);
 return {eligible:eligible.length,returned:returned.length,ratio:percent(returned.length,eligible.length)};
}

export default function CustomerAnalysis(){
 const [report,setReport]=useState<Report|null>(null),[rules,setRules]=useState<SeriesKeywordRule[]>([]),[overrides,setOverrides]=useState<Record<string,string>>({}),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [startDate,setStartDate]=useState(""),[endDate,setEndDate]=useState(""),[search,setSearch]=useState(""),[sort,setSort]=useState("amount"),[repeatOnly,setRepeatOnly]=useState(false),[selected,setSelected]=useState<string|null>(null),[visible,setVisible]=useState(50);
 const isAll=!startDate&&!endDate;
 const invalidRange=Boolean(startDate&&endDate&&startDate>endDate);
 const selectedMonth=startDate.endsWith("-01")&&endDate===monthEnd(startDate.slice(0,7))?startDate.slice(0,7):"";
 const changePeriod=(start:string,end:string)=>{setStartDate(start);setEndDate(end);setSelected(null);setVisible(50)};
 useEffect(()=>{let live=true;Promise.all([
   fetch("/api/sales-management",{cache:"no-store"}),
   fetch("/api/sales-management/item-keywords",{cache:"no-store"}),
   fetch("/api/sales-management/item-series-overrides",{cache:"no-store"})
  ]).then(async responses=>{
   const [sales,keywords,manual]=await Promise.all(responses.map(response=>response.json()));
   if(!responses[0].ok||!sales.ok)throw Error(sales.message||"고객 데이터 조회 실패");
   if(!responses[1].ok||!keywords.ok)throw Error(keywords.message||"작품 키워드 조회 실패");
   if(!responses[2].ok||!manual.ok)throw Error(manual.message||"수동 작품 분류 조회 실패");
   if(live){setReport(sales);setRules((keywords.rules||[]).map((rule:SeriesKeywordRule)=>({...rule,series_name:rule.series_name==="야생"?"쿠지":rule.series_name})));setOverrides(Object.fromEntries((manual.overrides||[]).map((row:{item_key:string;series_name:string})=>[row.item_key,row.series_name])));}
  }).catch(e=>{if(live)setError(String(e.message||e))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const all=useMemo(()=>customersFrom(report?.all_time_sales_rows||[],new Set((report?.settings?.item_settings||[]).filter(x=>x.deleted).map(x=>String(x.id))),rules,overrides),[report,rules,overrides]);
 const months=useMemo(()=>[...new Set(all.flatMap(c=>c.entries.map(e=>day(e.at).slice(0,7))))].sort().reverse(),[all]);
 const active=useMemo(()=>scopeCustomers(all,startDate,endDate),[all,startDate,endDate]);
 const monthRows=useMemo(()=>monthlyCustomerRows(all,active,months),[all,active,months]);
 const list=useMemo(()=>active.filter(c=>(!repeatOnly||c.events.length>1)&&normalize(c.name).includes(normalize(search))).sort((a,b)=>{
  if(sort==="broadcast")return b.videos.size-a.videos.size||b.total-a.total;
  if(sort==="orders")return b.orders.size-a.orders.size||b.total-a.total;
  if(sort==="latest")return b.last-a.last;
  return b.total-a.total;
 }),[active,repeatOnly,search,sort]);
 const detail=active.find(c=>c.key===selected);
 const asOf=endDate?Math.min(Date.now(),Date.parse(endDate+"T23:59:59.999+09:00")):Date.now();
 const lifecycle=useMemo(()=>buildLifecycle(active,asOf),[active,asOf]);
 const full60=lifecycle.filter(x=>x.observed60),full90=lifecycle.filter(x=>x.observed90);
 const accumulated=[0,1,2].map((i)=>({index:i,eligible:lifecycle.filter(x=>x.ageDays>=(i+1)*30),amount:lifecycle.filter(x=>x.ageDays>=(i+1)*30).reduce((v,x)=>v+x.bins[i],0)}));
 const concentration=[1,5,10].map(n=>({n,amount:active.slice(0,n).reduce((v,x)=>v+x.total,0),ratio:percent(active.slice(0,n).reduce((v,x)=>v+x.total,0),active.reduce((v,x)=>v+x.total,0))}));
 const stages=["최근 유입 큰손","초반 집중형","초반 집중 관찰","지속 구매형","재구매 유지","30일 이상 미구매","최근 유입","관찰 중"];
 const countStages=stages.map(stage=>({stage,count:lifecycle.filter(x=>x.stage===stage).length,amount:lifecycle.filter(x=>x.stage===stage).reduce((v,x)=>v+x.buyer.total,0)}));
 const r7=retentionFor(active,asOf,7),r30=retentionFor(active,asOf,30);
 const repeats=active.filter(c=>c.events.length>1).length;
 const sales=active.reduce((s,c)=>s+c.total,0);
 return <main style={{maxWidth:1400,margin:"auto",padding:"24px 20px 60px",color:"#0f172a"}}>
  <header style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:18}}>
   <div><div style={{fontSize:12,color:"#64748b"}}>매출관리 / 고객 분석</div><h1 style={{fontSize:28,margin:"6px 0"}}>고객별 매출 · 재구매 분석</h1><p style={{color:"#64748b",fontSize:13}}>고객 구매액, 참여 방송, 신규·기존 고객, 재구매 추이</p></div>
   <nav style={{display:"flex",gap:8}}><Link href="/sales-management" style={control}>← 매출관리</Link><Link href="/sales-management/broadcast-trends" style={control}>방송 트렌드</Link></nav>
  </header>
  {loading&&<div style={panel}>고객 데이터 불러오는 중…</div>}
  {error&&<div role="alert" style={{...panel,color:"#b91c1c"}}>{error}</div>}
  {!loading&&!error&&report&&<>
   <div style={{...panel,marginBottom:16,fontSize:13,lineHeight:1.7,background:"#f8fafc"}}><b>집계 기준:</b> 현재 와이스 매출자료의 고객 고유 ID가 없어 <b>닉네임 기준</b>으로 묶어. 닉네임 변경 전후는 다른 고객으로 계산될 수 있어. ‘방송 참여’는 시청이 아니라 <b>해당 방송에서 구매한 이력</b>이야. 재구매는 첫 구매와 구분되는 방송/주문에서 다시 구매한 경우로 계산해.</div>
   <div style={{...panel,marginBottom:16,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
    <b style={{fontSize:14}}>기간</b>
    <input type="date" aria-label="시작일" style={control} value={startDate} onChange={e=>changePeriod(e.target.value,endDate)}/>
    <span>~</span>
    <input type="date" aria-label="종료일" style={control} value={endDate} onChange={e=>changePeriod(startDate,e.target.value)}/>
    <button type="button" aria-pressed={isAll} style={{...control,cursor:"pointer",fontWeight:700,...(isAll?{background:"#2563eb",borderColor:"#2563eb",color:"#fff"}:{})}} onClick={()=>changePeriod("","")}>전체</button>
    <select aria-label="월 빠른 선택" style={control} value={selectedMonth} onChange={e=>{const m=e.target.value;if(m)changePeriod(m+"-01",monthEnd(m));else changePeriod("","")}}><option value="">월 선택</option>{months.map(m=><option key={m} value={m}>{m}</option>)}</select>
    <span style={{fontSize:12,color:"#64748b"}}>{isAll?"전체 구매 이력 분석 중":"선택 기간의 판매일 기준으로 모든 분석을 다시 계산해."}</span>
    {invalidRange&&<div role="alert" style={{width:"100%",fontSize:12,color:"#b91c1c"}}>시작일이 종료일보다 늦어. 기간을 다시 선택해 줘.</div>}
   </div>
   {!invalidRange&&!active.length&&<div style={{...panel,marginBottom:16,color:"#64748b",fontSize:13}}>선택한 기간에 구매 데이터가 없어.</div>}
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}>
    {[
     ["구매 고객",won(active.length)+"명","선택 기간 기준"],
     ["재구매 고객",won(repeats)+"명",percent(repeats,active.length)+" · 선택 기간 기준"],
     ["기간 매출",won(sales)+"원","선택 기간 매출"],
     ["7일 재구매율",r7.ratio,r7.returned+"/"+r7.eligible+"명"],
     ["30일 재구매율",r30.ratio,r30.returned+"/"+r30.eligible+"명"],
     [isAll?"고객당 누적 평균":"고객당 기간 평균",won(active.length?sales/active.length:0)+"원","선택 기간 기준"]
    ].map(([name,value,caption])=><div key={name} style={panel}><div style={{fontSize:12,color:"#64748b"}}>{name}</div><div style={{fontSize:23,fontWeight:800,margin:"9px 0 7px"}}>{value}</div><div style={{fontSize:12,color:"#64748b"}}>{caption}</div></div>)}
   </div>
   <section style={{...panel,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 8px"}}>월별 신규 고객과 단골 매출</h2><p style={{fontSize:12,color:"#64748b"}}>선택 기간 내 해당 월의 첫 구매가 전체 이력상 첫 구매면 신규 고객, 그 이전에 구매 기록이 있으면 기존 고객이야. 매출은 선택 기간 내 거래만 합산해.</p>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["기간","구매 고객","신규 고객","기존 고객","매출","기존 고객 매출 비중"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{monthRows.map(x=><tr key={x.m}><td style={{...cell,textAlign:"left"}}>{x.m}</td><td style={cell}>{x.buyers}명</td><td style={cell}>{x.newBuyers}명</td><td style={cell}>{x.returning}명</td><td style={cell}>{won(x.revenue)}원</td><td style={cell}>{percent(x.returningRevenue,x.revenue)}</td></tr>)}</tbody></table></div>
   </section>

   <section style={{...panel,marginBottom:16}}>
    <h2 style={{fontSize:19,margin:"0 0 6px"}}>고객 소비 속도 · 지속성</h2>
    <p style={{fontSize:12,color:"#64748b",lineHeight:1.7}}>{isAll?"첫 구매일":"선택 기간 내 최초 구매일"}을 0일로 보고 0~29일, 30~59일, 60~89일에 실제 구매한 금액을 비교해. 관찰 종료일은 {endDate?"선택 종료일(현재 날짜 이전까지)":"오늘"}이야. 구매 이력이 관측되지 않는 기간은 이탈로 단정하지 않아.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:16}}>
     {[
      ["첫 구매 후 60일 관찰 가능",full60.length+"명","미관찰 고객은 유형 판정 제한"],
      ["첫 구매 후 90일 관찰 가능",full90.length+"명","60~89일 구매 분석 가능"],
      ["최근 30일 미구매",lifecycle.filter(x=>x.idleDays>=30).length+"명","휴면 신호 · 영구 이탈 아님"],
      ["상위 10명 매출 집중도",concentration[2].ratio,won(concentration[2].amount)+"원"]
     ].map(([label,value,sub])=><div key={label} style={{background:"#f8fafc",borderRadius:10,padding:14}}><div style={{fontSize:12,color:"#64748b"}}>{label}</div><div style={{fontSize:22,fontWeight:800,margin:"8px 0"}}>{value}</div><div style={{fontSize:11,color:"#64748b"}}>{sub}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,450px),1fr))",gap:14}}>
     <div><h3 style={{fontSize:15}}>첫 구매 후 30일 단위 평균 매출</h3>
      {accumulated.map(x=>{const value=x.eligible.length?x.amount/x.eligible.length:0;const max=Math.max(1,...accumulated.map(y=>y.eligible.length?y.amount/y.eligible.length:0));return <div key={x.index} style={{margin:"14px 0"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><span>{x.index*30}~{x.index*30+29}일</span><span><b>{x.eligible.length?won(value)+"원":"관찰 부족"}</b> · {x.eligible.length}명</span></div><div style={{height:13,background:"#f1f5f9",borderRadius:5}}><div style={{height:"100%",width:(value/max*100)+"%",background:"#6366f1",borderRadius:5}}/></div></div>})}
      <p style={{fontSize:11,color:"#64748b",lineHeight:1.6}}>구간별로 관찰 가능한 고객 집단이 다를 수 있어. 동일 고객 비교가 필요하면 아래 표에서 60일 이상 관찰한 고객을 봐.</p>
     </div>
     <div><h3 style={{fontSize:15}}>고객 유형 분포 · 탐색용 규칙</h3><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{countStages.filter(x=>x.count>0).map(x=><div key={x.stage} style={{border:"1px solid #e2e8f0",borderRadius:9,padding:"10px 12px",minWidth:130}}><div style={{fontSize:12,color:"#475569"}}>{x.stage}</div><div style={{fontWeight:800,fontSize:19,marginTop:4}}>{x.count}명</div><div style={{fontSize:11,color:"#64748b"}}>{won(x.amount)}원 {isAll?"누적":"기간"}</div></div>)}</div>
      <p style={{fontSize:11,color:"#64748b",lineHeight:1.6}}>‘큰손’은 {isAll?"누적":"기간 내"} 구매액 상위 20%, ‘초반 집중형’은 60일 관찰 가능·첫 30일 매출 75% 이상·31~60일 매출이 첫 30일의 30% 미만인 고객. ‘지속 구매형’은 첫 구매 후 90일 관찰 가능하고 30~59일과 60~89일 모두 구매 기록이 있는 고객이야. 유형은 참고용이며 고객의 실제 소비 여력이나 이탈 의도를 뜻하지 않아.</p>
     </div>
    </div>
    <h3 style={{fontSize:15,marginTop:18}}>고객별 소비 흐름 ({isAll?"누적":"기간"} 매출 상위 30명)</h3>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["고객","유형","첫 구매 후 경과","최근 구매 경과","첫 0~29일","30~59일","60~89일","90일 이후",isAll?"누적 구매":"기간 구매"].map(x=><th key={x} style={head}>{x}</th>)}</tr></thead><tbody>{lifecycle.slice(0,30).map(x=><tr key={x.buyer.key} onClick={()=>setSelected(x.buyer.key)} style={{cursor:"pointer"}}><td style={{...cell,textAlign:"left",fontWeight:700}}>{x.buyer.name}</td><td style={cell}>{x.stage}</td><td style={cell}>{x.ageDays}일</td><td style={cell}>{x.idleDays}일</td>{x.bins.map((v,i)=><td key={i} style={cell}>{i<3&&x.ageDays<(i+1)*30?won(v)+"원 · 진행 중":won(v)+"원"}</td>)}<td style={cell}>{won(x.buyer.total)}원</td></tr>)}</tbody></table></div>
    <p style={{fontSize:11,color:"#64748b",marginTop:10}}>첫 30일이나 60일이 아직 지나지 않은 고객은 해당 구간을 ‘진행 중’으로 표시해. {isAll?"수집 시작 이전 구매 이력은 확인되지 않아.":"선택 기간 안에서 확인된 최초 구매를 기준으로 계산하며 기간 이전의 구매는 소비 흐름과 재구매 집계에 포함하지 않아."}</p>
   </section>
   <section style={{...panel,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 8px"}}>고객별 {isAll?"누적":"기간"} 실적</h2><p style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>닉네임 옆 🥇·🥈·🥉 배지는 <b>실판매 상세 분석의 수동 작품 분류를 우선 적용</b>하고, 해당 분류가 없으면 작품 키워드 규칙으로 분류한 {isAll?"누적":"기간 내"} 구매금액 상위 3개 작품이야. 미분류·키워드 충돌·기타는 선호 작품 순위에서 제외해.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}><input aria-label="고객 검색" placeholder="닉네임 검색" style={control} value={search} onChange={e=>{setSearch(e.target.value);setVisible(50)}}/><select aria-label="정렬" style={control} value={sort} onChange={e=>setSort(e.target.value)}><option value="amount">구매금액순</option><option value="broadcast">참여 방송순</option><option value="orders">주문 건수순</option><option value="latest">최근 구매순</option></select><label style={{fontSize:13}}><input type="checkbox" checked={repeatOnly} onChange={e=>setRepeatOnly(e.target.checked)}/> 재구매 고객만</label></div>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["고객",isAll?"누적 구매금액":"기간 구매금액","주문","상품","구매 참여 방송",isAll?"첫 구매":"기간 내 첫 구매","최근 구매","재구매"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{list.slice(0,visible).map(c=><tr key={c.key} style={{background:selected===c.key?"#eff6ff":"#fff",cursor:"pointer"}} onClick={()=>setSelected(selected===c.key?null:c.key)}><td style={{...cell,textAlign:"left",fontWeight:700}}>{c.name}<FavoriteBadges entries={c.entries}/></td><td style={cell}>{won(c.total)}원</td><td style={cell}>{c.orders.size}건</td><td style={cell}>{c.entries.length}개</td><td style={cell}>{c.videos.size}회</td><td style={cell}>{day(c.first)}</td><td style={cell}>{day(c.last)}</td><td style={cell}>{c.events.length>1?"재구매":"첫 구매만"}</td></tr>)}</tbody></table></div>
    <div style={{fontSize:12,color:"#64748b",marginTop:12}}>{list.length}명 중 {Math.min(visible,list.length)}명 표시 {visible<list.length&&<button style={{...control,marginLeft:12}} onClick={()=>setVisible(n=>n+50)}>50명 더 보기</button>}</div>
   </section>
   {detail&&<section style={panel}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><h2 style={{fontSize:19,margin:0}}>{detail.name} 고객 상세</h2><button style={control} onClick={()=>setSelected(null)}>닫기</button></div>
    <p style={{fontSize:13}}>총 {won(detail.total)}원 · 주문 {detail.orders.size}건 · 방송 {detail.videos.size}회 · 구매 {detail.entries.length}개</p>
    <h3 style={{fontSize:15}}>구매 참여 방송</h3><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["방송 ID","최초 구매일","구매금액","상품"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{[...detail.videos].map(id=>{const items=detail.entries.filter(x=>x.video===id);return {id,items,first:Math.min(...items.map(x=>x.at))}}).sort((a,b)=>b.first-a.first).map(v=><tr key={v.id}><td style={{...cell,textAlign:"left",fontFamily:"monospace"}} title={v.id}>{v.id.slice(0,14)}…</td><td style={cell}>{day(v.first)}</td><td style={cell}>{won(v.items.reduce((s,e)=>s+e.amount,0))}원</td><td style={cell}>{v.items.length}개</td></tr>)}</tbody></table></div>
    <h3 style={{fontSize:15}}>최근 구매 상품</h3><div style={{overflowX:"auto",maxHeight:350,overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["판매일","주문 ID","상품명","작품","금액"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{[...detail.entries].reverse().slice(0,100).map(x=><tr key={x.id}><td style={cell}>{day(x.at)}</td><td style={cell}>{x.order}</td><td style={{...cell,textAlign:"left",whiteSpace:"normal"}}>{x.name}</td><td style={cell}>{x.series}</td><td style={cell}>{won(x.amount)}원</td></tr>)}</tbody></table></div>
   </section>}
   <p style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>7일/30일 재구매율은 {isAll?"첫 구매":"선택 기간 내 최초 구매"} 후 해당 기간이 지난 고객만 분모에 포함하고, 관찰 종료일 이후의 구매는 반영하지 않아. 방송 참여는 구매 참여 횟수야. 더 정확한 고객 추적에는 와이스 고정 고객 ID 연동이 필요해.</p>
  </>}
 </main>;
}
