"use client";
import {useMemo,useState} from "react";

type Order={order_id:string;nickname:string;platform:string;first_order_date:string|null;order_status:string|null;tracking_registered:boolean};
type WiseRow={nickname:string;order_id:string;days:number;status:"unshipped"|"pending"|"confirmed"|"urgent";source:"ddoga"|"wise"};
function daysSince(date:string|null){
 if(!date)return -1;
 const m=date.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
 if(!m)return -1;
 const d=Date.UTC(+m[1],+m[2]-1,+m[3]);
 const now=new Date();
 return Math.floor((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-d)/86400000);
}
export default function WiseDeadlineBoard({orders}:{orders:Order[]}){
 const [open,setOpen]=useState(false);
 const [wiseRows,setWiseRows]=useState<WiseRow[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const rows=useMemo(()=>{
  if(wiseRows)return wiseRows;
  return orders.filter(o=>String(o.platform||"").toLowerCase()==="wise"&&o.order_status!=="done"&&o.order_status!=="kept"&&!o.tracking_registered)
   .map(o=>({nickname:o.nickname,order_id:o.order_id,days:daysSince(o.first_order_date),status:daysSince(o.first_order_date)>=13?"urgent" as const:"unshipped" as const,source:"ddoga" as const}));
 },[orders,wiseRows]);
 const unique=(a:WiseRow[])=>Array.from(new Map(a.map(r=>[r.nickname.trim().toLowerCase(),r])).values()).filter(x=>x.nickname);
 const unshipped=unique(rows.filter(r=>r.status==="unshipped"||r.status==="urgent"));
 const candidates=unique(rows.filter(r=>r.status==="unshipped"&&r.days>=11&&r.days<13));
 const pending=unique(rows.filter(r=>r.status==="pending"));
 const urgent=unique(rows.filter(r=>r.status==="urgent"||(r.status==="unshipped"&&r.days>=13)));
 async function refresh(){
  setBusy(true);setNotice("");
  // This dashboard deliberately does not claim to have live Wise data without a confirmed API response.
  setWiseRows(null);
  setNotice("현재는 DDOGA 주문일 기준 임시 집계야. 와이스 실시간 상태 조회는 API 확인 후 연결할 예정이야.");
  setBusy(false);
 }
 const card=(label:string,count:number,color:string,detail?:string)=>(
  <div style={{border:"1px solid #111827",borderRadius:12,padding:14,background:color}}>
   <div style={{fontSize:13,fontWeight:700}}>{label}</div>
   <div style={{fontSize:24,fontWeight:800,marginTop:4}}>{count}명</div>
   {detail&&<div style={{fontSize:11,color:"#6b7280",marginTop:4}}>{detail}</div>}
  </div>
 );
 return <div style={{marginTop:16,padding:16,background:"#FFF54F",border:"1px solid #111827",borderRadius:14}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:10}}>
   <strong>와이스 배송기한 관리</strong>
   <button type="button" onClick={()=>void refresh()} disabled={busy} style={{padding:"7px 12px",borderRadius:8,border:"1px solid #ddd",background:"white",cursor:"pointer"}}>집계 새로고침</button>
  </div>
  <div style={{fontSize:12,color:"#92400e",marginBottom:10}}>DDOGA 기준 임시 집계 · 와이스 직접배송/수령확인 상태는 아직 연동되지 않았어.</div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10}}>
   {card("미발송 구매자",unshipped.length,"#fff")}
   {card("직킵여부 확인대상",candidates.length,"#fffbe6","11일 이상 · 13일 미만")}
   {card("수령확인 대기",pending.length,"#fefce8","와이스 상태 연동 전")}
   {card("발송긴급",urgent.length,"#fef2f2","13일 이상")}
  </div>
  <div style={{marginTop:12,border:"1px solid #e5e7eb",borderRadius:10,overflow:"hidden"}}>
   <button type="button" onClick={()=>setOpen(v=>!v)} style={{width:"100%",textAlign:"left",background:"#fff7ed",border:0,padding:12,cursor:"pointer",fontWeight:700}}>
    {open?"▼":"▶"} 직킵여부 확인대상 {candidates.length}명
   </button>
   {open&&<div style={{padding:12}}>
    {candidates.length?candidates.map(x=><div key={x.order_id} style={{padding:"8px 0",borderBottom:"1px solid #eee"}}>
     <span style={{fontWeight:700}}>{x.nickname}</span> <span style={{fontSize:12,color:"#6b7280"}}>· {x.days}일 경과</span>
     <span style={{fontSize:12,marginLeft:8,color:"#92400e"}}>메시지·direct 연동 준비 중</span>
    </div>):<span style={{fontSize:13,color:"#6b7280"}}>대상 없음</span>}
   </div>}
  </div>
  {pending.length>0&&<div style={{marginTop:10,fontSize:13}}>수령확인 대기: {pending.map(x=>x.nickname).join(", ")}</div>}
  {urgent.length>0&&<div style={{marginTop:10,padding:10,borderRadius:8,background:"#fef2f2",fontSize:13}}><strong>발송긴급:</strong> {urgent.map(x=>x.nickname+" ("+x.days+"일)").join(", ")}</div>}
  {notice&&<p role="status" style={{fontSize:12}}>{notice}</p>}
 </div>;
}
