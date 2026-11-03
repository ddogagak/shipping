"use client";
import Link from "next/link";
import {useEffect,useMemo,useState,type CSSProperties} from "react";
type Sale={id:string;order_id:string;buyer_nickname:string;item_price:number;item_name:string;ordered_at:string;sold_at?:string|null;video_id?:string|null};
type Report={ok:boolean;message?:string;all_time_sales_rows:Sale[];settings?:{item_settings?:{id:string;deleted:boolean}[]}};
type Entry={id:string;order:string;video:string|null;amount:number;at:number;name:string};
type Buyer={key:string;name:string;entries:Entry[];videos:Set<string>;orders:Set<string>;first:number;last:number;total:number;events:number[];second:number|null};
const won=(n:number)=>Math.round(n).toLocaleString("ko-KR");
const normalize=(s:string)=>s.normalize("NFKC").replace(/\s+/g,"").trim().toLowerCase();
const day=(t:number)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(t);
const panel:CSSProperties={padding:18,border:"1px solid #e2e8f0",borderRadius:14,background:"#fff"};
const control:CSSProperties={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:8,background:"#fff",color:"#0f172a"};
const head:CSSProperties={textAlign:"right",padding:"11px 12px",fontSize:12,color:"#64748b",borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"};
const cell:CSSProperties={textAlign:"right",padding:"11px 12px",borderBottom:"1px solid #f1f5f9",whiteSpace:"nowrap"};
function customersFrom(rows:Sale[],deleted:Set<string>){
 const grouped=new Map<string,{name:string;entries:Entry[]}>();
 for(const r of rows){
  if(deleted.has(String(r.id)))continue;
  const name=String(r.buyer_nickname||"").trim();
  if(!name||name==="(닉네임 없음)")continue;
  const at=Date.parse(r.sold_at||r.ordered_at);
  if(!Number.isFinite(at))continue;
  const key=normalize(name),group=grouped.get(key)||{name,entries:[]};
  group.entries.push({id:String(r.id),order:String(r.order_id),video:r.video_id||null,amount:Number(r.item_price)||0,at,name:r.item_name});
  grouped.set(key,group);
 }
 const all:Buyer[]=[];
 for(const [key,value] of grouped){
  const entries=value.entries.sort((a,b)=>a.at-b.at);
  const events=new Map<string,number>();
  for(const e of entries){
   const eventKey=e.video?"broadcast:"+e.video:"order:"+e.order;
   events.set(eventKey,Math.min(events.get(eventKey)??Infinity,e.at));
  }
  const times=[...events.values()].sort((a,b)=>a-b);
  all.push({key,name:value.name,entries,videos:new Set(entries.map(e=>e.video).filter((x):x is string=>Boolean(x))),orders:new Set(entries.map(e=>e.order)),first:entries[0].at,last:entries[entries.length-1].at,total:entries.reduce((sum,e)=>sum+e.amount,0),events:times,second:times[1]??null});
 }
 return all.sort((a,b)=>b.total-a.total);
}
const percent=(n:number,d:number)=>d?(100*n/d).toFixed(1)+"%":"—";
export default function CustomerAnalysis(){
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [month,setMonth]=useState("all"),[search,setSearch]=useState(""),[sort,setSort]=useState("amount"),[repeatOnly,setRepeatOnly]=useState(false),[selected,setSelected]=useState<string|null>(null),[visible,setVisible]=useState(50);
 useEffect(()=>{let live=true;fetch("/api/sales-management",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||"데이터 조회 실패");if(live)setReport(d);}).catch(e=>{if(live)setError(String(e.message||e))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 const all=useMemo(()=>customersFrom(report?.all_time_sales_rows||[],new Set((report?.settings?.item_settings||[]).filter(x=>x.deleted).map(x=>String(x.id)))),[report]);
 const months=useMemo(()=>[...new Set(all.flatMap(c=>c.entries.map(e=>day(e.at).slice(0,7))))].sort().reverse(),[all]);
 const monthRows=useMemo(()=>months.map(m=>{
  const buyers=all.filter(c=>c.entries.some(e=>day(e.at).startsWith(m))),newBuyers=buyers.filter(c=>day(c.first).startsWith(m));
  const revenue=buyers.reduce((a,c)=>a+c.entries.filter(e=>day(e.at).startsWith(m)).reduce((s,e)=>s+e.amount,0),0);
  const returningRevenue=buyers.filter(c=>day(c.first).slice(0,7)<m).reduce((a,c)=>a+c.entries.filter(e=>day(e.at).startsWith(m)).reduce((s,e)=>s+e.amount,0),0);
  return {m,buyers:buyers.length,newBuyers:newBuyers.length,returning:buyers.length-newBuyers.length,revenue,returningRevenue};
 }),[all,months]);
 const active=useMemo(()=>all.filter(c=>month==="all"||c.entries.some(e=>day(e.at).startsWith(month))),[all,month]);
 const list=useMemo(()=>active.filter(c=>(!repeatOnly||c.events.length>1)&&normalize(c.name).includes(normalize(search))).sort((a,b)=>{
  if(sort==="broadcast")return b.videos.size-a.videos.size||b.total-a.total;
  if(sort==="orders")return b.orders.size-a.orders.size||b.total-a.total;
  if(sort==="latest")return b.last-a.last;
  return b.total-a.total;
 }),[active,repeatOnly,search,sort]);
 const detail=all.find(c=>c.key===selected);
 const asOf=Date.now();
 const retention=(days:number)=>{
  const cutoff=days*86400000;
  const eligible=all.filter(c=>c.first+cutoff<=asOf);
  const returned=eligible.filter(c=>c.second!==null&&c.second<=c.first+cutoff&&c.second>c.first);
  return {eligible:eligible.length,returned:returned.length,ratio:percent(returned.length,eligible.length)};
 };
 const r7=retention(7),r30=retention(30);
 const repeats=active.filter(c=>c.events.length>1).length;
 const sales=active.reduce((s,c)=>s+c.entries.filter(e=>month==="all"||day(e.at).startsWith(month)).reduce((a,e)=>a+e.amount,0),0);
 return <main style={{maxWidth:1400,margin:"auto",padding:"24px 20px 60px",color:"#0f172a"}}>
  <header style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:18}}>
   <div><div style={{fontSize:12,color:"#64748b"}}>매출관리 / 고객 분석</div><h1 style={{fontSize:28,margin:"6px 0"}}>고객별 매출 · 재구매 분석</h1><p style={{color:"#64748b",fontSize:13}}>고객 구매액, 참여 방송, 신규·기존 고객, 재구매 추이</p></div>
   <nav style={{display:"flex",gap:8}}><Link href="/sales-management" style={control}>← 매출관리</Link><Link href="/sales-management/broadcast-trends" style={control}>방송 트렌드</Link></nav>
  </header>
  {loading&&<div style={panel}>고객 데이터 불러오는 중…</div>}
  {error&&<div role="alert" style={{...panel,color:"#b91c1c"}}>{error}</div>}
  {!loading&&!error&&report&&<>
   <div style={{...panel,marginBottom:16,fontSize:13,lineHeight:1.7,background:"#f8fafc"}}><b>집계 기준:</b> 현재 와이스 매출자료의 고객 고유 ID가 없어 <b>닉네임 기준</b>으로 묶어. 닉네임 변경 전후는 다른 고객으로 계산될 수 있어. ‘방송 참여’는 시청이 아니라 <b>해당 방송에서 구매한 이력</b>이야. 재구매는 첫 구매와 구분되는 방송/주문에서 다시 구매한 경우로 계산해.</div>
   <div style={{...panel,marginBottom:16,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}><label>기간 <select style={control} value={month} onChange={e=>{setMonth(e.target.value);setVisible(50)}}><option value="all">전체</option>{months.map(m=><option key={m} value={m}>{m}</option>)}</select></label><span style={{fontSize:12,color:"#64748b"}}>기간별 구매자 목록을 필터링하되 고객별 누적 금액과 재구매는 전체 이력 기준으로 표시해.</span></div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}>
    {[
     ["구매 고객",won(active.length)+"명","선택 기간 기준"],
     ["재구매 고객",won(repeats)+"명",percent(repeats,active.length)+" · 전체 이력 기준"],
     ["기간 매출",won(sales)+"원","선택 기간 매출"],
     ["7일 재구매율",r7.ratio,r7.returned+"/"+r7.eligible+"명"],
     ["30일 재구매율",r30.ratio,r30.returned+"/"+r30.eligible+"명"],
     ["고객당 누적 평균",won(active.length?active.reduce((s,c)=>s+c.total,0)/active.length:0)+"원","선택 고객 전체 이력"]
    ].map(([name,value,caption])=><div key={name} style={panel}><div style={{fontSize:12,color:"#64748b"}}>{name}</div><div style={{fontSize:23,fontWeight:800,margin:"9px 0 7px"}}>{value}</div><div style={{fontSize:12,color:"#64748b"}}>{caption}</div></div>)}
   </div>
   <section style={{...panel,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 8px"}}>월별 신규 고객과 단골 매출</h2><p style={{fontSize:12,color:"#64748b"}}>첫 구매가 해당 월이면 신규 고객, 이전 달에도 구매 기록이 있으면 기존 고객이야. 관측 데이터 시작 이전 구매는 알 수 없어.</p>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["기간","구매 고객","신규 고객","기존 고객","매출","기존 고객 매출 비중"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{monthRows.filter(x=>month==="all"||x.m===month).map(x=><tr key={x.m}><td style={{...cell,textAlign:"left"}}>{x.m}</td><td style={cell}>{x.buyers}명</td><td style={cell}>{x.newBuyers}명</td><td style={cell}>{x.returning}명</td><td style={cell}>{won(x.revenue)}원</td><td style={cell}>{percent(x.returningRevenue,x.revenue)}</td></tr>)}</tbody></table></div>
   </section>
   <section style={{...panel,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 8px"}}>고객별 누적 실적</h2>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}><input aria-label="고객 검색" placeholder="닉네임 검색" style={control} value={search} onChange={e=>{setSearch(e.target.value);setVisible(50)}}/><select aria-label="정렬" style={control} value={sort} onChange={e=>setSort(e.target.value)}><option value="amount">구매금액순</option><option value="broadcast">참여 방송순</option><option value="orders">주문 건수순</option><option value="latest">최근 구매순</option></select><label style={{fontSize:13}}><input type="checkbox" checked={repeatOnly} onChange={e=>setRepeatOnly(e.target.checked)}/> 재구매 고객만</label></div>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["고객","누적 구매금액","주문","상품","구매 참여 방송","첫 구매","최근 구매","재구매"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{list.slice(0,visible).map(c=><tr key={c.key} style={{background:selected===c.key?"#eff6ff":"#fff",cursor:"pointer"}} onClick={()=>setSelected(selected===c.key?null:c.key)}><td style={{...cell,textAlign:"left",fontWeight:700}}>{c.name}</td><td style={cell}>{won(c.total)}원</td><td style={cell}>{c.orders.size}건</td><td style={cell}>{c.entries.length}개</td><td style={cell}>{c.videos.size}회</td><td style={cell}>{day(c.first)}</td><td style={cell}>{day(c.last)}</td><td style={cell}>{c.events.length>1?"재구매":"첫 구매만"}</td></tr>)}</tbody></table></div>
    <div style={{fontSize:12,color:"#64748b",marginTop:12}}>{list.length}명 중 {Math.min(visible,list.length)}명 표시 {visible<list.length&&<button style={{...control,marginLeft:12}} onClick={()=>setVisible(n=>n+50)}>50명 더 보기</button>}</div>
   </section>
   {detail&&<section style={panel}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><h2 style={{fontSize:19,margin:0}}>{detail.name} 고객 상세</h2><button style={control} onClick={()=>setSelected(null)}>닫기</button></div>
    <p style={{fontSize:13}}>총 {won(detail.total)}원 · 주문 {detail.orders.size}건 · 방송 {detail.videos.size}회 · 구매 {detail.entries.length}개</p>
    <h3 style={{fontSize:15}}>구매 참여 방송</h3><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["방송 ID","최초 구매일","구매금액","상품"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{[...detail.videos].map(id=>{const items=detail.entries.filter(x=>x.video===id);return {id,items,first:Math.min(...items.map(x=>x.at))}}).sort((a,b)=>b.first-a.first).map(v=><tr key={v.id}><td style={{...cell,textAlign:"left",fontFamily:"monospace"}} title={v.id}>{v.id.slice(0,14)}…</td><td style={cell}>{day(v.first)}</td><td style={cell}>{won(v.items.reduce((s,e)=>s+e.amount,0))}원</td><td style={cell}>{v.items.length}개</td></tr>)}</tbody></table></div>
    <h3 style={{fontSize:15}}>최근 구매 상품</h3><div style={{overflowX:"auto",maxHeight:350,overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["판매일","주문 ID","상품명","금액"].map(x=><th style={head} key={x}>{x}</th>)}</tr></thead><tbody>{[...detail.entries].reverse().slice(0,100).map(x=><tr key={x.id}><td style={cell}>{day(x.at)}</td><td style={cell}>{x.order}</td><td style={{...cell,textAlign:"left",whiteSpace:"normal"}}>{x.name}</td><td style={cell}>{won(x.amount)}원</td></tr>)}</tbody></table></div>
   </section>}
   <p style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>7일/30일 재구매율은 첫 구매 후 해당 기간이 지난 고객만 분모에 포함했어. 현재 수집된 데이터 안에서만 계산하며, 방송 참여율이 아닌 방송 내 구매 참여 횟수야. 더 정확한 고객 추적에는 와이스 고정 고객 ID 연동이 필요해.</p>
  </>}
 </main>;
}
