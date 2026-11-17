"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type SaleRow = { id:string; order_id:string; item_name:string; item_price:number; buyer_nickname:string; sold_at?:string|null; video_id?:string|null };
type Report = { ok:boolean; message?:string; all_time_sales_rows:SaleRow[]; settings?:{ item_settings?:Array<{id:string;deleted:boolean}> }; last_imported_at?:string|null };
type Sale = { at:number; amount:number; id:string; buyer:string };
type Session = { id:string; first:number; last:number; sales:number; items:number; buyers:number; salesList:Sale[]; month:string; duration:number };

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
  bucket.list.push({at,amount:Number(row.item_price)||0,id:row.id,buyer:row.buyer_nickname||row.order_id});
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
type DayBasis="end"|"actual";
type Metric="perHour"|"amount"|"buyers"|"items";
type Bucket={amount:number;rateAmount:number;items:number;buyers:Set<string>;sessions:Set<string>;saleSessions:Set<string>;minutes:number};
const weekdays=["월","화","수","목","금","토","일"];
const kstOffset=9*3600000;
const weekday=(at:number)=>(new Date(at+kstOffset).getUTCDay()+6)%7;
const hourOf=(at:number)=>new Date(at+kstOffset).getUTCHours();
const minuteOf=(at:number)=>new Date(at+kstOffset).getUTCMinutes();
const clockLabel=(minutes:number)=>String(Math.floor((minutes%1440)/60)).padStart(2,"0")+":"+String(minutes%60).padStart(2,"0");
const timeLabel=(index:number,step:number)=>clockLabel(index*step)+"~"+clockLabel((index+1)*step);
const newBucket=():Bucket=>({amount:0,rateAmount:0,items:0,buyers:new Set(),sessions:new Set(),saleSessions:new Set(),minutes:0});
const rate=(b:Bucket)=>b.minutes>0?b.rateAmount/(b.minutes/60):null;
const metricLabel:Record<Metric,string>={perHour:"추정 시간당 매출",amount:"총매출",buyers:"구매자 수",items:"판매 수량"};
function metricValue(b:Bucket,m:Metric):number|null{
 if(m==="perHour")return rate(b);
 if(m==="buyers")return b.buyers.size;
 if(m==="items")return b.items;
 return b.amount;
}
function metricText(b:Bucket,m:Metric){
 const v=metricValue(b,m);
 return v===null?"-":money(v)+(m==="buyers"?"명":m==="items"?"개":"원");
}
function buildClockMetrics(sessions:Session[],step:number,basis:DayBasis){
 const count=1440/step,length=step*60000;
 const times=Array.from({length:count},newBucket);
 const days=Array.from({length:7},newBucket);
 const cells=Array.from({length:count},()=>Array.from({length:7},newBucket));
 const dayFor=(at:number,s:Session)=>weekday(basis==="end"?s.last:at);
 const slotFor=(at:number)=>Math.floor((hourOf(at)*60+minuteOf(at))/step);
 for(const session of sessions){
  // Track exposure before adding sales, including intervals with no sale.
  for(let t=session.first;t<session.last;){
   const next=Math.min(session.last,(Math.floor(t/length)+1)*length);
   const index=slotFor(t),day=dayFor(t,session),minutes=(next-t)/60000;
   for(const b of [times[index],days[day],cells[index][day]]){
    b.minutes+=minutes;b.sessions.add(session.id);
   }
   t=next;
  }
  for(const sale of session.salesList){
   const index=slotFor(sale.at),day=dayFor(sale.at,session);
   for(const b of [times[index],days[day],cells[index][day]]){
    b.amount+=sale.amount;b.items++;b.buyers.add(sale.buyer);b.saleSessions.add(session.id);
    // A single sale without measurable exposure cannot establish an hourly rate.
    if(b.sessions.has(session.id))b.rateAmount+=sale.amount;
   }
  }
 }
 return {times,days,cells};
}
function MetricsTable({rows}:{rows:{key:string;label:string;bucket:Bucket}[]}){
 return <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}>
  <thead><tr>{["구분","총매출","시간당 매출*","구매자","판매수량","방송 수","판매 구간"].map(t=><th style={th} key={t}>{t}</th>)}</tr></thead>
  <tbody>{rows.map(({key,label,bucket:b})=><tr key={key}>
   <td style={{...td,textAlign:"left",fontWeight:700}}>{label}</td><td style={td}>{money(b.amount)}원</td>
   <td style={{...td,fontWeight:800}}>{metricText(b,"perHour")}</td>
   <td style={td}>{money(b.buyers.size)}명</td><td style={td}>{money(b.items)}개</td>
   <td style={td}>{new Set([...b.sessions,...b.saleSessions]).size}회</td><td style={td}>{Math.round(b.minutes)}분</td>
  </tr>)}</tbody>
 </table></div>;
}
function WeekHourMatrix({cells,step,metric}:{cells:Bucket[][];step:number;metric:Metric}){
 const peak=Math.max(1,...cells.flat().map(b=>metricValue(b,metric)||0));
 const colors=["#fff7d6","#fde68a","#fdba74","#f97316","#b91c1c"];
 return <div style={{overflowX:"auto",marginTop:12}}><table style={{borderCollapse:"separate",borderSpacing:4,width:"100%",minWidth:690,fontSize:12}}>
  <thead><tr><th style={{...th,textAlign:"left"}}>시간대 (KST)</th>{weekdays.map(d=><th key={d} style={{...th,textAlign:"center"}}>{d}</th>)}</tr></thead>
  <tbody>{cells.map((row,index)=><tr key={index}><th scope="row" style={{...td,textAlign:"left",fontSize:12}}>{timeLabel(index,step)}</th>{row.map((b,day)=>{
   const v=metricValue(b,metric),hasData=b.minutes>0||b.items>0,hasValue=hasData&&v!==null;
   const strength=Math.max(0,Math.min(1,(v||0)/peak));
   const band=Math.min(4,Math.floor(strength*5));
   const bg=hasValue?colors[band]:"#f8fafc",dark=hasValue&&band===4;
   return <td key={day} title={timeLabel(index,step)+" · "+weekdays[day]+"요일 · 총매출 "+money(b.amount)+"원 · 구매자 "+b.buyers.size+"명 · 판매 "+b.items+"개 · 방송 "+new Set([...b.sessions,...b.saleSessions]).size+"회 · 추정 "+b.minutes.toFixed(1)+"분"} style={{padding:"9px 5px",textAlign:"center",background:bg,borderRadius:5,whiteSpace:"nowrap",fontWeight:700,color:!hasValue?"#94a3b8":dark?"#fff":"#0f172a"}}>
    {hasData?metricText(b,metric):"—"}{hasData&&<div style={{fontSize:10,fontWeight:400,color:dark?"#fee2e2":"#475569",marginTop:3}}>{new Set([...b.sessions,...b.saleSessions]).size}회 · {Math.round(b.minutes)}분</div>}
   </td>;
  })}</tr>)}</tbody>
 </table></div>;
}

export default function BroadcastTrendsPage(){
 const [report,setReport]=useState<Report|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [month,setMonth]=useState("all"),[step,setStep]=useState(60);
 const [metric,setMetric]=useState<Metric>("perHour");
 const [dayBasis,setDayBasis]=useState<DayBasis>("end");
 const [selected,setSelected]=useState("all");
 useEffect(()=>{let alive=true;fetch("/api/sales-management?view=sales",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||"방송 데이터를 불러오지 못했어.");if(alive)setReport(d);}).catch(e=>{if(alive)setError(String(e.message||e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
 const {sessions,unmapped}=useMemo(()=>buildSessions(report?.all_time_sales_rows||[],new Set((report?.settings?.item_settings||[]).filter(p=>p.deleted).map(p=>p.id))),[report]);
 const months=useMemo(()=>Array.from(new Set(sessions.map(s=>s.month))).sort().reverse(),[sessions]);
 const inMonth=useMemo(()=>sessions.filter(s=>month==="all"||s.month===month),[sessions,month]);
 const active=useMemo(()=>selected==="all"?inMonth:inMonth.filter(s=>s.id===selected),[inMonth,selected]);
 const clock=useMemo(()=>buildClockMetrics(active,step,dayBasis),[active,step,dayBasis]);
 const total=active.reduce((s,x)=>s+x.sales,0),allMs=active.reduce((s,x)=>s+x.duration,0),allItems=active.reduce((s,x)=>s+x.items,0);
 const measuredSales=active.filter(s=>s.duration>0).reduce((sum,s)=>sum+s.sales,0);
 const topTime=clock.times.map((bucket,index)=>({bucket,index})).filter(x=>rate(x.bucket)!==null).sort((a,b)=>(rate(b.bucket)||0)-(rate(a.bucket)||0))[0];
 const topDay=clock.days.map((bucket,index)=>({bucket,index})).filter(x=>rate(x.bucket)!==null).sort((a,b)=>(rate(b.bucket)||0)-(rate(a.bucket)||0))[0];
 const topCell=clock.cells.flatMap((row,index)=>row.map((bucket,day)=>({bucket,index,day}))).filter(x=>(x.bucket.minutes>0||x.bucket.items>0)&&metricValue(x.bucket,metric)!==null).sort((a,b)=>(metricValue(b.bucket,metric)||0)-(metricValue(a.bucket,metric)||0))[0];
 return <main style={{maxWidth:1380,margin:"auto",padding:"24px 20px 60px",color:"#0f172a"}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:20}}>
   <div><div style={{fontSize:12,color:"#64748b",marginBottom:6}}>매출관리 / 방송 트렌드</div><h1 style={{fontSize:29,margin:0}}>방송 트렌드 분석</h1><p style={{...muted,margin:"8px 0 0"}}>요일·실제 판매 시간대별 매출과 구매자 비교</p></div>
   <div style={{display:"flex",gap:8}}><Link href="/sales-management" style={{...control,textDecoration:"none"}}>← 매출관리</Link><Link href="/domestic-upload" style={{...control,textDecoration:"none"}}>주문 동기화</Link></div>
  </div>
  {loading&&<p>방송 데이터 불러오는 중…</p>}
  {error&&<div role="alert" style={{...frame,color:"#b91c1c"}}>{error}</div>}
  {!loading&&!error&&report&&<>
   <section style={{...frame,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:16}}>
    <label style={{fontSize:13,fontWeight:700}}>기간 <select value={month} onChange={e=>{setMonth(e.target.value);setSelected("all");}} style={{...control,marginLeft:7}}><option value="all">전체 기간</option>{months.map(m=><option value={m} key={m}>{m.replace("-","년 ")}월</option>)}</select></label>
    <label style={{fontSize:13,fontWeight:700}}>분석 방송 <select value={selected} onChange={e=>setSelected(e.target.value)} style={{...control,marginLeft:7,maxWidth:230}}><option value="all">선택 기간 전체 방송</option>{inMonth.map(s=><option value={s.id} key={s.id}>{dateText(s.first)} · {money(s.sales)}원</option>)}</select></label>
    <label style={{fontSize:13,fontWeight:700}}>요일 기준 <select value={dayBasis} onChange={e=>setDayBasis(e.target.value as DayBasis)} style={{...control,marginLeft:7}}><option value="end">방송 종료일 기준</option><option value="actual">실제 판매일 기준</option></select></label>
    <label style={{fontSize:13,fontWeight:700}}>시간 간격 <select value={step} onChange={e=>setStep(Number(e.target.value))} style={{...control,marginLeft:7}}><option value={30}>30분</option><option value={60}>60분</option></select></label>
   </section>
   <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:16}}>
    {[
     ["방송 횟수",money(active.length)+"회","고유 videoId 기준"],
     ["방송 매출",money(total)+"원",money(allItems)+"개 판매"],
     ["누적 판매 구간",duration(allMs),"최초~최종 판매 시간의 합"],
     ["시간당 매출",allMs?money(measuredSales/(allMs/3600000))+"원":"-","측정 가능한 판매 구간 기준"],
     ["효율 최고 시간대",topTime?timeLabel(topTime.index,step):"-",topTime?metricText(topTime.bucket,"perHour"):"측정 데이터 없음"],
     ["효율 최고 요일",topDay?weekdays[topDay.index]+"요일":"-",topDay?metricText(topDay.bucket,"perHour"):"측정 데이터 없음"]
    ].map(([title,main,sub])=><div key={title} style={frame}><div style={{...muted,fontWeight:700}}>{title}</div><strong style={{display:"block",fontSize:23,margin:"10px 0 5px",letterSpacing:"-.035em"}}>{main}</strong><span style={muted}>{sub}</span></div>)}
   </section>
   <section style={{...frame,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
     <div><h2 style={{fontSize:19,margin:"0 0 6px"}}>요일 × 실제 시간대 분석</h2><p style={{...muted,margin:0}}>{dayBasis==="end"?"방송의 마지막 판매일을 해당 방송의 요일로 사용":"각 판매와 판매 구간을 실제 한국시간 요일에 귀속"} · 시각은 항상 실제 KST 기준.</p></div>
     <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(Object.keys(metricLabel) as Metric[]).map(m=><button key={m} onClick={()=>setMetric(m)} style={{...control,background:metric===m?"#d1fae5":"#fff"}}>{metricLabel[m]}</button>)}</div>
    </div>
    <p style={{fontSize:13,margin:"14px 0 0"}}>{metricLabel[metric]} 최고 조합: <b>{topCell?weekdays[topCell.day]+"요일 "+timeLabel(topCell.index,step)+" · "+metricText(topCell.bucket,metric):"측정 데이터 없음"}</b></p>
    <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:7,marginTop:12,fontSize:12,color:"#64748b"}}><span>낮음</span>{["#fff7d6","#fde68a","#fdba74","#f97316","#b91c1c"].map(color=><span key={color} style={{display:"inline-block",width:24,height:13,background:color,borderRadius:3}}/>)}<span>높음 (선택 지표 최고값 대비)</span></div>
    <WeekHourMatrix cells={clock.cells} step={step} metric={metric}/>
    <p style={{...muted,lineHeight:1.7,marginBottom:0}}>노랑에서 주황, 빨강으로 갈수록 선택 지표가 높아. 방송 횟수와 무관하게 모든 측정값을 같은 기준으로 색상 비교해. 회색은 해당 지표를 측정할 데이터가 없는 구간이야. 시간당 매출은 최초~최종 판매 구간을 시간대로 나눈 추정치이며, 시간당 계산에는 해당 칸의 측정 가능한 방송 매출만 사용해.</p>
   </section>
   <section style={{...frame,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 6px"}}>요일별 방송 성과</h2><p style={muted}>누적 매출뿐 아니라 시간당 매출과 해당 요일의 고유 구매자(닉네임 기준)를 비교해.</p>
    <MetricsTable rows={clock.days.map((bucket,index)=>({key:String(index),label:weekdays[index]+"요일",bucket}))}/>
   </section>
   <section style={{...frame,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 6px"}}>실제 시간대별 방송 성과 (한국시간)</h2><p style={muted}>선택한 시간 간격 기준이며 판매가 없는 방송 구간도 시간당 매출 계산에 포함돼. * 시간당 매출은 측정 가능한 판매 구간 기준이야.</p>
    <MetricsTable rows={clock.times.map((bucket,index)=>({key:String(index),label:timeLabel(index,step),bucket}))}/>
   </section>
   <section style={{...frame,marginBottom:16}}><h2 style={{fontSize:18,margin:"0 0 8px"}}>월별 방송 효율 비교</h2>
    <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["기간","방송","방송 매출","총 판매시간","시간당 매출","방송당 평균","구매자"].map(t=><th key={t} style={th}>{t}</th>)}</tr></thead><tbody>{months.map(m=>{const list=sessions.filter(s=>s.month===m),rev=list.reduce((x,s)=>x+s.sales,0),ms=list.reduce((x,s)=>x+s.duration,0),measured=list.filter(s=>s.duration>0).reduce((x,s)=>x+s.sales,0),buyers=new Set(list.flatMap(s=>s.salesList.map(x=>x.buyer))).size;return <tr key={m} onClick={()=>{setMonth(m);setSelected("all");}} style={{cursor:"pointer",background:month===m?"#eff6ff":"#fff"}}><td style={{...td,textAlign:"left",fontWeight:800}}>{m.replace("-","년 ")}월</td><td style={td}>{list.length}회</td><td style={td}>{money(rev)}원</td><td style={td}>{duration(ms)}</td><td style={td}>{ms?money(measured/(ms/3600000))+"원":"-"}</td><td style={td}>{money(rev/list.length)}원</td><td style={td}>{money(buyers)}명</td></tr>;})}</tbody></table></div>
   </section>
   <section style={frame}><h2 style={{fontSize:18,margin:"0 0 8px"}}>방송별 상세 분석</h2><p style={muted}>행을 선택하면 해당 방송만 위 분석표에 표시돼. 고객 수는 닉네임 기준 추정치야.</p>
    <div style={{overflowX:"auto",maxHeight:540,overflowY:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",fontSize:13}}><thead><tr>{["최초 판매 일시","최종 판매 일시","종료 요일","방송 ID","판매 구간","매출","아이템","구매자","시간당 매출"].map(t=><th key={t} style={th}>{t}</th>)}</tr></thead><tbody>{inMonth.map(s=>{return <tr key={s.id} onClick={()=>setSelected(s.id)} style={{cursor:"pointer",background:selected===s.id?"#ecfdf5":"#fff"}}><td style={{...td,textAlign:"left"}}>{dateText(s.first)}</td><td style={td}>{dateText(s.last)}</td><td style={td}>{weekdays[weekday(s.last)]}요일</td><td style={{...td,fontFamily:"monospace",fontSize:11}}>{s.id.slice(0,12)}…</td><td style={td}>{duration(s.duration)}</td><td style={td}>{money(s.sales)}원</td><td style={td}>{s.items}개</td><td style={td}>{s.buyers}명</td><td style={td}>{s.duration?money(s.sales/(s.duration/3600000))+"원":"-"}</td></tr>;})}</tbody></table></div>
   </section>
   <div style={{...muted,lineHeight:1.7,marginTop:15}}>
    <b>해석 주의</b> · 방송 시작은 실제 송출 시작이 아니라 첫 판매시각이며, 방송 종료도 마지막 판매시각이야. 판매 없는 대기시간은 실제 방송과 차이가 있을 수 있어. 측정 가능한 판매 구간이 없는 방송은 매출·수량·구매자에는 포함되고 시간당 매출에서는 제외돼. 구매자 수는 각 구간 안의 고유 닉네임 기준이며 구간 간 합산하면 중복될 수 있어. 방송은 최초 판매 월에 귀속되며, 키워드 제외·저장된 삭제 설정을 반영해. 판매시간/방송 ID가 없는 아이템 {money(unmapped)}개는 이 통계에서 제외돼. 현재 집계는 확정된 총매출이 아니라 분석 대상 방송의 판매 기록 기준이야.
   </div>
  </>}
 </main>;
}
