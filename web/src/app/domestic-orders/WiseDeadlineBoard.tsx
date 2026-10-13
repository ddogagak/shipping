"use client";
import {useMemo,useState,useEffect,useRef} from "react";

type Order={order_id:string;nickname:string;platform:string;first_order_date:string|null;order_status:string|null;tracking_registered:boolean};
type Snapshot={userId:string;nickname:string;orders:{id:number;status:number;createdAt:string;deliveryCompany?:string;deliveryCode?:string}[]};
const CACHE_KEY="ddoga:wise-deadline-snapshot:v1";
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
 const popupRef=useRef<Window|null>(null);
 const [wiseRows,setWiseRows]=useState<WiseRow[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [updatedAt,setUpdatedAt]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  let active=true;
  fetch("/api/domestic/wise-snapshot",{cache:"no-store"}).then(async res=>{
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"DB 조회 실패");
   if(active&&data.snapshot&&Array.isArray(data.snapshot.rows)){
    setWiseRows(data.snapshot.rows);
    setUpdatedAt(data.snapshot.updated_at);
    localStorage.setItem(CACHE_KEY,JSON.stringify({rows:data.snapshot.rows,updatedAt:data.snapshot.updated_at}));
   }
  }).catch(error=>{if(active)setNotice("DB 조회 실패 · 브라우저 저장본 표시 중: "+String(error.message||error));});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  try{
   const saved=localStorage.getItem(CACHE_KEY);
   if(saved){
    const parsed=JSON.parse(saved);
    if(Array.isArray(parsed.rows)&&typeof parsed.updatedAt==="string"){
     setWiseRows(parsed.rows);
     setUpdatedAt(parsed.updatedAt);
    }
   }
  }catch{setNotice("저장된 동기화 데이터를 읽을 수 없어.");}
 },[]);
 useEffect(()=>{
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!=="https://wyyyes.com"||event.source!==popupRef.current)return;
   if(event.data?.type==="DDOGA_WISE_SHIP_READY"){
    popupRef.current?.postMessage({type:"DDOGA_WISE_SNAPSHOT_REQUEST"},"https://wyyyes.com");
   }
   if(event.data?.type==="DDOGA_WISE_SNAPSHOT_RESULT"){
    setBusy(false);
    if(event.data.error){setNotice(String(event.data.error));return;}
    const buyers:Snapshot[]=Array.isArray(event.data.records)?event.data.records:[];
    const next:WiseRow[]=[];
    for(const buyer of buyers)for(const order of buyer.orders||[]){
     if(![10,16,25].includes(Number(order.status)))continue;
     const days=daysSince(order.createdAt);
     const pending=Number(order.status)===16&&order.deliveryCompany==="DIRECT";
     if(Number(order.status)===25)continue; // 발송완료는 긴급/미발송 집계에서 제외
     next.push({nickname:buyer.nickname,order_id:String(order.id),days,status:pending?"pending":days>=13?"urgent":"unshipped",source:"wise"});
    }
    const time=new Date().toISOString();
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({rows:next,updatedAt:time}));}
    catch{setNotice("동기화 완료. 다만 브라우저 저장에 실패했어.");}
    setWiseRows(next);
    setUpdatedAt(time);
    setNotice("와이스 "+buyers.length+"명 조회 완료 · DB 저장 중...");
    void fetch("/api/domestic/wise-snapshot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:next})})
      .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||"DB 저장 실패");setUpdatedAt(data.updatedAt);localStorage.setItem(CACHE_KEY,JSON.stringify({rows:next,updatedAt:data.updatedAt}));setNotice("와이스 "+buyers.length+"명 동기화 · DB 저장 완료");})
      .catch(error=>setNotice("와이스 조회 완료 · DB 저장 실패: "+String(error.message||error)));
   }
  };
  window.addEventListener("message",onMessage);
  return()=>window.removeEventListener("message",onMessage);
 },[]);
 const rows=useMemo(()=>wiseRows||[],[wiseRows]);
 const unique=(a:WiseRow[])=>Array.from(new Map(a.filter(x=>x.nickname).sort((a,b)=>b.days-a.days).map(r=>[r.nickname.trim().toLowerCase(),r])).values());
 const unshipped=unique(rows.filter(r=>r.status==="unshipped"||r.status==="urgent"));
 const candidates=unique(rows.filter(r=>r.status==="unshipped"&&r.days>=11&&r.days<13));
 const pending=unique(rows.filter(r=>r.status==="pending"));
 const urgent=unique(rows.filter(r=>r.status==="urgent"||(r.status==="unshipped"&&r.days>=13)));
 function refresh(){
  setBusy(true);setNotice("와이스 응답을 기다리는 중...");
  const popup=window.open("https://wyyyes.com/shipping-waiting-user-list","ddoga_wise_shipping");
  if(!popup){setBusy(false);setNotice("팝업 차단을 해제해줘.");return;}
  popupRef.current=popup;
  popup.focus();
  let tries=0;
  const timer=window.setInterval(()=>{
   if(popup.closed||tries++>=30){window.clearInterval(timer);if(tries>=30){setBusy(false);setNotice("와이스 응답 시간 초과. 몽키 스크립트를 확인해줘.");}return;}
   popup.postMessage({type:"DDOGA_WISE_SHIP_PING"},"https://wyyyes.com");
  },600);
  window.setTimeout(()=>window.clearInterval(timer),19000);
 }
 const nicknameStyle={display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #111827",borderRadius:8,padding:"5px 8px",background:"#fff",fontWeight:800,fontSize:13} as const;
 const timeLabel=updatedAt?new Date(updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}):"동기화 기록 없음";
 const card=(label:string,count:number,color:string,detail?:string)=>(
  <div style={{border:"1px solid #111827",borderRadius:12,padding:14,background:color}}>
   <div style={{fontSize:13,fontWeight:700}}>{label}</div>
   <div style={{fontSize:24,fontWeight:800,marginTop:4}}>{count}명</div>
   {detail&&<div style={{fontSize:11,color:"#6b7280",marginTop:4}}>{detail}</div>}
  </div>
 );
 return <div style={{marginTop:16,padding:16,background:"#fff",border:"1px solid #111827",borderRadius:14}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:10}}>
   <strong>와이스 배송기한 관리</strong>
   <div style={{display:"flex",alignItems:"center",gap:9}}>
    <span style={{fontSize:12,fontWeight:700,color:"#111827"}}>최근 업데이트: {timeLabel}</span>
    <button type="button" aria-label="와이스 동기화 새로고침" title="와이스 동기화 새로고침" onClick={refresh} disabled={busy} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:38,height:38,border:"2px solid #111827",borderRadius:"50%",background:"#fff",color:"#111827",cursor:busy?"wait":"pointer",opacity:busy?0.5:1}}>
     <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.4 6.1"/><path d="M20 4v7h-7"/></svg>
    </button>
   </div>
  </div>
  {!wiseRows&&<div style={{fontSize:12,color:"#111827",marginBottom:10}}>와이스 동기화 기록이 없어. 오른쪽 새로고침 아이콘을 눌러줘.</div>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10}}>
   {card("미발송 구매자",unshipped.length,"#fff")}
   <div style={{border:"1px solid #111827",borderRadius:12,padding:14,background:"#fffbe6"}}>
    <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} style={{width:"100%",border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827"}}>
     <div style={{fontSize:13,fontWeight:700}}>직킵여부 확인대상</div>
     <div style={{fontSize:24,fontWeight:800,marginTop:4}}>{candidates.length}명 <span style={{fontSize:14}}>{open?"▲":"▼"}</span></div>
     <div style={{fontSize:11,color:"#6b7280",marginTop:4}}>11일 이상 · 13일 미만</div>
    </button>
    {open&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>{candidates.length?candidates.map(x=><span key={x.order_id} style={nicknameStyle}>{x.nickname} <span style={{fontSize:11,fontWeight:600}}>({x.days}일)</span><button type="button" onClick={()=>{const url="https://wyyyes.com/shipping-waiting-user-list";const popup=window.open(url,"ddoga_wise_keep");if(!popup){setNotice("와이스 팝업 차단을 해제해줘.");return;}popup.focus();setNotice(x.nickname+"님의 주문을 와이스에서 확인해줘. 실제 전달 완료 전에는 DIRECT 발송완료 처리하지 마.");}} style={{background:"#111827",color:"#fff",border:0,borderRadius:6,padding:"4px 8px",cursor:"pointer"}}>직킵</button></span>):<span style={{fontSize:12}}>대상 없음</span>}</div>}
   </div>
   <div style={{border:"1px solid #111827",borderRadius:12,padding:14,background:"#fefce8"}}>
    <div style={{fontSize:13,fontWeight:700}}>수령확인 대기</div>
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:4}}>
     <span style={{fontSize:24,fontWeight:800}}>{pending.length}명</span>
     {pending.map(x=><span key={x.order_id} style={nicknameStyle}>{x.nickname}</span>)}
    </div>
   </div>
   {card("발송긴급",urgent.length,"#fef2f2","13일 이상")}
  </div>
  {urgent.length>0&&<div style={{marginTop:10,padding:10,borderRadius:8,background:"#fef2f2",fontSize:13}}><strong>발송긴급:</strong> {urgent.map(x=><span key={x.order_id} style={{...nicknameStyle,marginRight:6}}>{x.nickname} ({x.days}일)</span>)}</div>}
  {notice&&<p role="status" style={{fontSize:12}}>{notice}</p>}
 </div>;
}
