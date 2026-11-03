"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type SaleRow = { id:string; order_id:string; item_name:string; item_price:number; buyer_nickname:string; sold_at?:string|null; video_id?:string|null };
type Report = { ok:boolean; message?:string; all_time_sales_rows:SaleRow[]; settings?:{ item_settings?:Array<{id:string;deleted:boolean}> }; last_imported_at?:string|null };
type Sale = { at:number; amount:number; id:string };
type Session = { id:string; first:number; last:number; sales:number; items:number; buyers:number; salesList:Sale[]; month:string; duration:number };
type Slot = { index:number; amount:number; sales:number; eligible:number; average:number; share:number; cumulative:number };
const money=(n:number)=>Math.round(n).toLocaleString("ko-KR");
const duration=(ms:number)=>{const m=Math.round(ms/60000);return Math.floor(m/60)+"시간 "+String(m%60).padStart(2,"0")+"분";};
const dateText=(v:number)=>new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v));
const monthOf=(v:number)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).format(new Date(v));
const frame:CSSProperties={border:"1px solid #e5e7eb",borderRadius:14,padding:18,background:"#fff"};
const muted:CSSProperties={color:"#64748b",fontSize:12};
const control:CSSProperties={border:"1px solid #cbd5e1",borderRadius:9,padding:"9px 12px",background:"#fff",color:"#0f172a",fontWeight:700};
const th:CSSProperties={padding:"12px 13px",textAlign:"right",fontSize:12,color:"#64748b",whiteSpace:"nowrap",borderBottom:"1px solid #e2e8f0"};
const td:CSSProperties={padding:"12px 13px",textAlign:"right",borderBottom:"1px solid #f1f5f9",whiteSpace:"nowrap"};
function buildSessions(rows:SaleRow[],deleted:Set<string>){
 const map=new Map<string,{list:Sale[];buyers:Set<string>}>();
 let unmapped=0;
 for(const row of rows){
  if(deleted.has(row.id))continue;
  const at=Date.parse(row.sold_at||"");
  if(!row.video_id||!Number.isFinite(at)){unmapped++;continue;}
  const bucket=map.get(row.video_id)||{list:[],buyers:new Set<string>()};
  bucket.list.push({at,amount:Number(row.item_price)||0,id:row.id});
  bucket.buyers.add(row.buyer_nickname||row.order_id);
  map.set(row.video_id,bucket);
 }
 const sessions:Session[]=[];
 for(const [id,info] of map){
  info.list.sort((a,b)=>a.at-b.at);
  const first=info.list[0]?.at,last=info.list[info.list.length-1]?.at;
  if(first===undefined||last===undefined)continue;
  sessions.push({id,first,last,month:monthOf(first),duration:last-first,sales:info.list.reduce((s,x)=>s+x.amount,0),items:info.list.length,buyers:info.buyers.size,salesList:info.list});
 }
 return {sessions:sessions.sort((a,b)=>b.first-a.first),unmapped};
}
function slotMetrics(sessions:Session[],minutes:number):Slot[]{
 if(!sessions.length)return [];
 const length=minutes*60000;
 const maxElapsed=Math.max(...sessions.map(s=>s.duration));
 const count=Math.min(48,Math.floor(maxElapsed/length)+1);
 const total=sessions.reduce((sum,s)=>sum+s.sales,0);
 const slots:Slot[]=[];
 let cumulative=0;
 for(let i=0;i<count;i++){
  const start=i*length,end=(i+1)*length;
  const eligible=sessions.filter(s=>s.duration>=start);
  let amount=0,sales=0;
  for(const session of sessions){
   for(const sale of session.salesList){
    const elapsed=sale.at-session.first;
    if(elapsed>=start&&elapsed<end){amount+=sale.amount;sales++;}
   }
  }
  cumulative+=amount;
  slots.push({index:i,amount,sales,eligible:eligible.length,average:eligible.length?amount/eligible.length:0,share:total?amount/total*100:0,cumulative:total?cumulative/total*100:0});
 }
 return slots;
}
function quantile(values:number[],q:number){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);const p=(a.length-1)*q;const low=Math.floor(p),high=Math.ceil(p);return a[low]*(high-p)+a[high]*(p-low);}
function BarGraph({slots,metric,minutes}:{slots:Slot[];metric:"amount"|"average";minutes:number}){
 const peak=Math.max(1,...slots.map(s=>s[metric]));
 return <div style={{overflowX:"auto"}}>
  <div style={{display:"flex",gap:8,alignItems:"flex-end",minWidth:Math.max(620,slots.length*56),height:230,padding:"30px 8px 0",borderBottom:"1px solid #cbd5e1"}}>
   {slots.map(s=><div key={s.index} title={(s.index*minutes)+"~"+((s.index+1)*minutes)+"분 | "+money(s[metric])+"원 | 방송 "+s.eligible+"회"} style={{flex:1,minWidth:38,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",alignItems:"center",gap:3}}>
    <span style={{fontSize:11,color:"#475569"}}>{s[metric]>=10000?Math.round(s[metric]/10000)+"만":money(s[metric])}</span>
    <div style={{height:Math.max(3,Math.round(s[metric]/peak*166)),width:"75%",borderRadius:"5px 5px 0 0",background:metric==="amount"?"#2563eb":"#0d9488"}}/>
    <span style={{fontSize:10,color:"#64748b",height:27,textAlign:"center"}}>{s.index*minutes}분</span>
   </div>)}
  </div>
 </div>;
}
function CumulativeGraph({slots,minutes}:{slots:Slot[];minutes:number}){
 if(!slots.length)return null;
 const w=Math.max(620,slots.length*55),h=240,pad=35;
 const pts=slots.map((s,i)=>({x:pad+(i/(Math.max(1,slots.length-1)))*(w-pad*2),y:h-pad-(s.cumulative/100)*(h-pad*2),value:s.cumulative}));
 const path=pts.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
 return <div style={{overflowX:"auto"}}>
  <svg width={w} height={h} role="img" aria-label="방송 경과시간별 누적 매출 비율">
   {[0,25,50,75,100].map(v=><g key={v}><line x1={pad} x2={w-pad} y1={h-pad-v/100*(h-pad*2)} y2={h-pad-v/100*(h-pad*2)} stroke="#e2e8f0"/><text x={pad-7} y={h-pad-v/100*(h-pad*2)+4} textAnchor="end" fontSize="11" fill="#64748b">{v}%</text></g>)}
   <path d={path} stroke="#7c3aed" fill="none" strokeWidth="3" strokeLinejoin="round"/>
   {pts.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="3.5" fill="#7c3aed"/>{(i%Math.max(1,Math.ceil(slots.length/12))===0||i===pts.length-1)&&<text x={p.x} y={h-9} textAnchor="middle" fontSize="10" fill="#64748b">{(i+1)*minutes}분</text>}</g>)}
  </svg>
 </div>;
}
export default function BroadcastTrendsPage(){
 const [report,setReport]=useState<Report|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [month,setMonth]=useState("all"),[step,setStep]=useState(30);
 const [metric,setMetric]=useState<"amount"|"average">("average");
 const [selected,setSelected]=useState("all");
 useEffect(()=>{let alive=true;fetch("/api/sales-management",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||"방송 데이터를 불러오지 못했어.");if(alive)setReport(d);}).catch(e=>{if(alive)setError(String(e.message||e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
 const {sessions,unmapped}=useMemo(()=>buildSessions(report?.all_time_sales_rows||[],new Set((report?.settings?.item_settings||[]).filter(p=>p.deleted).map(p=>p.id))),[report]);
 const months=useMemo(()=>Array.from(new Set(sessions.map(s=>s.month))).sort().reverse(),[sessions]);
 const inMonth=useMemo(()=>sessions.filter(s=>month==="all"||s.month===month),[sessions,month]);
 const active=useMemo(()=>selected==="all"?inMonth:inMonth.filter(s=>s.id===selected),[inMonth,selected]);
 const slots=useMemo(()=>slotMetrics(active,step),[active,step]);
 const total=active.reduce((s,x)=>s+x.sales,0),allMs=active.reduce((s,x)=>s+x.duration,0),allItems=active.reduce((s,x)=>s+x.items,0);
 const ratio=(hours:number)=>total?active.reduce((sum,s)=>sum+s.salesList.filter(x=>x.at-s.first<=hours*3600000).reduce((a,x)=>a+x.amount,0),0)/total*100:0;
 const continued=(hours:number)=>active.filter(s=>s.duration>=hours*3600000).length;
 const threshold=(pct:number)=>{if(!slots.length)return "-";const x=slots.find(s=>s.cumulative>=pct);return x?((x.index+1)*step)+"분":"> "+slots.length*step+"분";};
 return <main style={{maxWidth:1380,margin:"auto",padding:"24px 20px 60px",color:"#0f172a"}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:20}}>
   <div><div style={{fontSize:12,color:"#64748b",marginBottom:6}}>매출관리 / 방송 트렌드</div><h1 style={{fontSize:29,margin:0}}>방송 경과시간별 매출 분석</h1><p style={{...muted,margin:"8px 0 0"}}>첫 판매시각 기준 · 방송별 매출 흐름과 적정 종료 시점 탐색</p></div>
   <div style={{display:"flex",gap:8}}><Link href="/sales-management" style={{...control,textDecoration:"none"}}>← 매출관리</Link><Link href="/domestic-upload" style={{...control,textDecoration:"none"}}>주문 동기화</Link></div>
  </div>
  {loading&&<p>방송 데이터 불러오는 중…</p>}
  {error&&<div role="alert" style={{...frame,color:"#b91c1c"}}>{error}</div>}
  {!loading&&!error&&report&&<>
   <section style={{...frame,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:16}}>
    <label style={{fontSize:13,fontWeight:700}}>기간 <select value={month} onChange={e=>{setMonth(e.target.value);setSelected("all");}} style={{...control,marginLeft:7}}><option value="all">전체 기간</option>{months.map(m=><option value={m} key={m}>{m.replace("-","년 ")}월</option>)}</select></label>
    <label style={{fontSize:13,fontWeight:700}}>분석 방송 <select value={selected} onChange={e=>setSelected(e.target.value)} style={{...control,marginLeft:7,maxWidth:230}}><option value="all">선택 기간 전체 방송</option>{inMonth.map(s=><option value={s.id} key={s.id}>{dateText(s.first)} · {money(s.sales)}원</option>)}</select></label>
    <label style={{fontSize:13,fontWeight:700}}>시간 간격 <select value={step} onChange={e=>setStep(Number(e.target.value))} style={{...control,marginLeft:7}}><option value={30}>30분</option><option value={60}>60분</option></select></label>
   </section>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:16}}>
    {[
     ["방송 횟수",money(active.length)+"회","고유 videoId 기준"],
     ["방송 매출",money(total)+"원",money(allItems)+"개 판매"],
     ["누적 판매 구간",duration(allMs),"최초~최종 판매 시간의 합"],
     ["시간당 매출",allMs?money(total/(allMs/3600000))+"원":"-","판매 구간 기준 추정"],
     ["2시간 이내 매출 비중",ratio(2).toFixed(1)+"%","2시간 이상 지속 "+continued(2)+"회"],
     ["3시간 이내 매출 비중",ratio(3).toFixed(1)+"%","3시간 이상 지속 "+continued(3)+"회"]
    ].map(([title,main,sub])=><div key={title} style={frame}><div style={{...muted,fontWeight:700}}>{title}</div><strong style={{display:"block",fontSize:23,margin:"10px 0 5px",letterSpacing:"-.035em"}}>{main}</strong><span style={muted}>{sub}</span></div>)}
   </section>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,480px),1fr))",gap:16,marginBottom:16}}>
    <article style={frame}>
     <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",alignItems:"center"}}><h2 style={{fontSize:18,margin:0}}>경과시간별 매출</h2><div style={{display:"flex",gap:5}}><button style={{...control,background:metric==="average"?"#d1fae5":"#fff"}} onClick={()=>setMetric("average")}>지속 방송당 평균</button><button style={{...control,background:metric==="amount"?"#dbeafe":"#fff"}} onClick={()=>setMetric("amount")}>총매출</button></div></div>
     <p style={muted}>각 막대는 해당 경과 구간의 매출. 평균은 그 구간까지 지속된 방송 수로 나눈 값이야.</p>
     {slots.length?<BarGraph slots={slots} minutes={step} metric={metric}/>:<p style={muted}>해당 기간 방송 데이터가 없어.</p>}
    </article>
    <article style={frame}><h2 style={{fontSize:18,margin:0}}>누적 방송 매출 비율</h2><p style={muted}>선택 방송들의 전체 매출 중 경과시간까지 벌어들인 비율. 장시간 방송이 후반부 비중을 높일 수 있어.</p>
     {slots.length?<CumulativeGraph slots={slots} minutes={step}/>:<p style={muted}>표시할 데이터가 없어.</p>}
     <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12,fontSize:13}}><span>매출 50% 도달 <b>{threshold(50)}</b></span><span>80% 도달 <b>{threshold(80)}</b></span><span>90% 도달 <b>{threshold(90)}</b></span></div>
    </article>
   </section>
   <section style={{...frame,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 6px"}}>시간 구간별 상세</h2><p style={muted}>방송이 짧으면 그 이후 구간의 분모에서 제외돼. 3시간 이후 구간의 표본이 적을수록 판단은 신중해야 해.</p>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["경과 구간","구간 매출","판매수량","지속 방송 수","지속 방송당 평균","전체 매출 중 비중","누적 비중"].map(t=><th key={t} style={th}>{t}</th>)}</tr></thead><tbody>{slots.map(s=><tr key={s.index}><td style={{...td,textAlign:"left",fontWeight:700}}>{s.index*step}~{(s.index+1)*step}분</td><td style={td}>{money(s.amount)}원</td><td style={td}>{money(s.sales)}개</td><td style={td}>{money(s.eligible)}회</td><td style={td}>{money(s.average)}원</td><td style={td}>{s.share.toFixed(1)}%</td><td style={td}>{s.cumulative.toFixed(1)}%</td></tr>)}</tbody></table></div>
   </section>
   <section style={{...frame,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 8px"}}>월별 방송 효율 비교</h2>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["기간","방송","방송 매출","총 판매시간","시간당 매출","방송당 평균","3시간 내 매출 비율"].map(t=><th key={t} style={th}>{t}</th>)}</tr></thead><tbody>{months.map(m=>{const list=sessions.filter(s=>s.month===m),rev=list.reduce((x,s)=>x+s.sales,0),ms=list.reduce((x,s)=>x+s.duration,0),early=list.reduce((x,s)=>x+s.salesList.filter(x=>x.at-s.first<=10800000).reduce((a,x)=>a+x.amount,0),0);return <tr key={m} onClick={()=>{setMonth(m);setSelected("all");}} style={{cursor:"pointer",background:month===m?"#eff6ff":"#fff"}}><td style={{...td,textAlign:"left",fontWeight:800}}>{m.replace("-","년 ")}월</td><td style={td}>{list.length}회</td><td style={td}>{money(rev)}원</td><td style={td}>{duration(ms)}</td><td style={td}>{ms?money(rev/(ms/3600000))+"원":"-"}</td><td style={td}>{money(rev/list.length)}원</td><td style={td}>{rev?(early/rev*100).toFixed(1):"0.0"}%</td></tr>;})}</tbody></table></div>
   </section>
   <section style={frame}><h2 style={{fontSize:18,margin:"0 0 8px"}}>방송별 상세 분석</h2><p style={muted}>행을 선택하면 해당 방송만 위 그래프에 표시돼. 고객 수는 닉네임 기준 추정치야.</p>
    <div style={{overflowX:"auto",maxHeight:540,overflowY:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["최초 판매 일시","방송 ID","판매 구간","매출","아이템","구매자","시간당 매출","2시간 내 비중"].map(t=><th key={t} style={th}>{t}</th>)}</tr></thead><tbody>{inMonth.map(s=>{const early=s.salesList.filter(x=>x.at-s.first<=7200000).reduce((x,y)=>x+y.amount,0);return <tr key={s.id} onClick={()=>setSelected(s.id)} style={{cursor:"pointer",background:selected===s.id?"#ecfdf5":"#fff"}}><td style={{...td,textAlign:"left"}}>{dateText(s.first)}</td><td style={{...td,fontFamily:"monospace",fontSize:11}}>{s.id.slice(0,12)}…</td><td style={td}>{duration(s.duration)}</td><td style={td}>{money(s.sales)}원</td><td style={td}>{s.items}개</td><td style={td}>{s.buyers}명</td><td style={td}>{s.duration?money(s.sales/(s.duration/3600000))+"원":"-"}</td><td style={td}>{s.sales?(early/s.sales*100).toFixed(1):"0.0"}%</td></tr>;})}</tbody></table></div>
   </section>
   <div style={{...muted,lineHeight:1.7,marginTop:15}}>
    <b>해석 주의</b> · 방송 시작은 실제 송출 시작이 아니라 첫 판매시각이며, 방송 종료도 마지막 판매시각이야. 판매 없는 대기시간은 실제 방송과 차이가 있을 수 있어. 판매가 한 개뿐인 방송은 0분으로 잡혀 시간당 매출에서 제외돼. 방송은 최초 판매 월에 귀속되며, 키워드 제외·저장된 삭제 설정을 반영해. 판매시간/방송 ID가 없는 아이템 {money(unmapped)}개는 이 통계에서 제외돼. 현재 집계는 확정된 총매출이 아니라 분석 대상 방송의 판매 기록 기준이야.
   </div>
  </>}
 </main>;
}
