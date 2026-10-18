"use client";
import {useEffect,useState,useRef} from "react";
const primaryButtonStyle={border:0,borderRadius:10,padding:"10px 14px",background:"#2563eb",color:"#fff",fontWeight:800,cursor:"pointer"} as const;
const darkButtonStyle={border:0,borderRadius:10,padding:"10px 14px",background:"#111827",color:"#fff",fontWeight:800,cursor:"pointer"} as const;
const secondaryButtonStyle={border:"1px solid #d1d5db",borderRadius:10,padding:"9px 14px",background:"#fff",color:"#374151",fontWeight:700,cursor:"pointer"} as const;
type UpdateCandidate={candidate_id:string;wise_order_id:number;order_id:string;nickname:string;ordered_at:string;wise_status:number;delivery_company:string|null;tracking_number:string;current:{tracking_registered:boolean|null;shipping_status:string|null;order_status:string|null;phone?:string|null};changes:Record<string,string|boolean>};
type Candidate={wise_order_id:number;nickname:string;ordered_at:string;items:number;existingDomestic:boolean;alreadyQueued:boolean;matched_order_ids:string[]};
const labels:Record<string,string>={accepted:"입력됨",checked:"재고확인",kept:"직배킵",packaged:"포장완료",done:"완료",start:"시작",excel_exported:"엑셀 추출",uploaded:"운송장 입력",registered:"운송장등록"};
function stateText(k:string,v:unknown){return k==="tracking_registered"?(v?"Y":"N"):v==null?"미설정":labels[String(v)]??String(v)}
export default function WiseJsonImport(){
 const [activity,setActivity]=useState<""|"pull"|"preview"|"save"|"update"|"sales_sync">("");
 const [pulling,setPulling]=useState(false);
 const pullTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function finishPull(){if(pullTimer.current)clearTimeout(pullTimer.current);setPulling(false);setActivity("");}
 useEffect(()=>()=>{if(pullTimer.current)clearTimeout(pullTimer.current)},[]);
 const [file,setFile]=useState<File|null>(null);
 const [wiseTab,setWiseTab]=useState<Window|null>(null);
 const [wiseConnected,setWiseConnected]=useState(false);
 const autoPreviewRef=useRef(false);
 useEffect(()=>{
  const allowedOrigin="https://wyyyes.com";
  function onMessage(event:MessageEvent){
   if(event.origin!==allowedOrigin||(event.source!==window.opener&&event.source!==wiseTab))return;
   const data=event.data;
   if(data?.type==="DDOGA_WISE_PULL_READY"){setWiseConnected(true);return;}
   if(data?.type==="DDOGA_WISE_PULL_ERROR"){finishPull();setMessage("판매목록 가져오기 실패: "+String(data.error||"조회 실패"));return;}
   if(data?.type==="DDOGA_WISE_PING"){
    (event.source as Window).postMessage({type:"DDOGA_WISE_READY"},allowedOrigin);
    return;
   }
   if(data?.type!=="DDOGA_WISE_ORDERS"||!Array.isArray(data.orders))return;
   if(data.orders.length>20000||!data.orders.every((o:unknown)=>o!==null&&typeof o==="object"&&Number.isSafeInteger((o as {id?:number}).id)&&Array.isArray((o as {stocks?:unknown}).stocks)))return;
   finishPull();
   const json=JSON.stringify(data.orders);
   if(json.length>15000000){setMessage("전송된 JSON이 15MB를 초과합니다.");return;}
   autoPreviewRef.current=true;
   setFile(new File([json],"wyyyes-orders.json",{type:"application/json"}));
   setPreview(null);
   setSelectedUpdates([]);
   setMessage("와이스 주문 "+data.orders.length+"건을 받았어. 자동 미리보기 중이야. DB는 아직 변경하지 않았어.");
   (event.source as Window).postMessage({type:"DDOGA_WISE_RECEIVED",count:data.orders.length},allowedOrigin);
  }
  window.addEventListener("message",onMessage);
  return ()=>window.removeEventListener("message",onMessage);
 },[wiseTab]);
 const [queue,setQueue]=useState<Array<{wise_order_id:number;buyer_nickname:string;ordered_at:string;item_summary:string;item_count:number;item_total_price:number}>>([]);
 const [queueError,setQueueError]=useState("");
 async function loadQueue(){try{const r=await fetch("/api/domestic/wise-json-queue");const d=await r.json();if(!r.ok)throw new Error(d.error);setQueue(d.orders??[]);setQueueError("");}catch(e){setQueueError(e instanceof Error?e.message:"조회 실패")}}
 async function handleQueue(id:number,action:"approve"|"ignore"){if(!confirm(action==="approve"?"이 신규 주문을 ddoga 주문으로 등록할까요?":"이 주문을 대기열에서 제외할까요?"))return;try{const r=await fetch("/api/domestic/wise-json-queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({wise_order_id:id,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);await loadQueue();setMessage(action==="approve"?`주문 등록 완료: ${d.order_id}`:"대기열에서 제외했습니다.");}catch(e){setMessage(e instanceof Error?e.message:"처리 실패")}}
 const [selectedNew,setSelectedNew]=useState<number[]>([]);
 const [selectedUpdates,setSelectedUpdates]=useState<string[]>([]);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [preview,setPreview]=useState<{total:number;new_orders:Candidate[];possible_existing:Candidate[];queued_orders:Candidate[];already_queued:number;update_candidates:UpdateCandidate[]}|null>(null);
 async function syncSales(){
  if(!file)return;
  setLoading(true);setActivity("sales_sync");setMessage("와이스 주문 매출자료 저장 중…");
  try{
   const form=new FormData();form.append("file",file);form.append("mode","sales_sync");
   const res=await fetch("/api/domestic/wise-json-import",{method:"POST",body:form});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"매출자료 저장 실패");
   setMessage("매출자료 저장 완료: "+Number(data.sales_saved_orders||0).toLocaleString("ko-KR")+"건");
  }catch(e){setMessage("매출자료 저장 실패: "+(e instanceof Error?e.message:"알 수 없는 오류"))}
  finally{setLoading(false);setActivity("")}
 }
 async function run(mode:"preview"|"save"){
  if(!file)return;
  if(mode==="save"&&(!selectedNew.length||!confirm(`선택 ${selectedNew.length}건을 등록할까?`)))return;
  if(mode==="preview")setPreview(null);
  setLoading(true);setActivity(mode);setMessage(mode==="preview"?"미리보기 가져오는 중 — DDOGA 기존 주문과 비교하고 있습니다.":`선택 ${selectedNew.length}건 DDOGA 등록 준비 중…`);
  try{
   const form=new FormData();form.append("file",file);form.append("mode",mode);if(mode==="save")form.append("selected_ids",JSON.stringify(selectedNew));
   const res=await fetch("/api/domestic/wise-json-import",{method:"POST",body:form});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"업로드 실패");
   if(mode==="preview"){setPreview(data);setSelectedNew([...data.new_orders,...(data.queued_orders??[]).filter((x:Candidate)=>!x.existingDomestic)].map((x:Candidate)=>x.wise_order_id));setSelectedUpdates([]);setMessage("미리보기 완료. 기존 주문 변경 목록은 미완료·미배송완료 주문 중 닉네임이 일치하고 DDOGA 전화번호가 빈 건만 표시합니다.");}
   else{setMessage(`선택 ${selectedNew.length}건 DDOGA 등록 중…`);const response=await fetch("/api/domestic/wise-json-queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve_bulk",wise_order_ids:selectedNew})});const result=await response.json();if(!response.ok)throw new Error(result.error||"일괄 등록 실패");setPreview(null);setSelectedNew([]);setMessage(`등록 성공 ${result.saved}건 / 실패 ${result.failed}건`+(result.failed?" : "+result.results.filter((x:{ok:boolean})=>!x.ok).map((x:{wise_order_id:number;error:string})=>x.wise_order_id+" "+x.error).join(", "):""));}
  }catch(e){setMessage("처리 실패: "+(e instanceof Error?e.message:"알 수 없는 오류"))}finally{setLoading(false);setActivity("")}
 }
 useEffect(()=>{if(file&&autoPreviewRef.current){autoPreviewRef.current=false;void run("preview");}},[file]);
 async function applyUpdates(){
  if(!file||!selectedUpdates.length)return;
  if(!confirm(`선택한 ${selectedUpdates.length}건의 비어 있는 전화번호를 업데이트할까요?`))return;
  setLoading(true);setActivity("update");setMessage(`기존 주문 ${selectedUpdates.length}건 변경사항 적용 중…`);
  try{
   const form=new FormData();form.append("file",file);form.append("mode","apply_updates");form.append("selected_ids",JSON.stringify(selectedUpdates));
   const r=await fetch("/api/domestic/wise-json-import",{method:"POST",body:form});const d=await r.json();
   if(!r.ok)throw new Error(d.error||"변경 실패");
   setMessage(`전화번호 업데이트 완료 ${d.updated}건 / 실패 ${d.failed}건`+(d.failed?" — "+d.results.filter((x:{ok:boolean})=>!x.ok).map((x:{order_id:string;error:string})=>x.order_id+": "+x.error).join(", "):""));
   setSelectedUpdates([]);
   setPreview(prev=>prev?{...prev,update_candidates:prev.update_candidates.filter(x=>!d.results.some((r:{candidate_id:string;ok:boolean})=>r.ok&&r.candidate_id===x.candidate_id))}:prev);
  }catch(e){setMessage("전화번호 업데이트 실패: "+(e instanceof Error?e.message:"변경 실패"))}finally{setLoading(false);setActivity("")}
 }
 return <section style={{border:"1px solid #e5e7eb",borderRadius:16,padding:20,background:"#fff",marginTop:16}}>
  <h2 style={{marginTop:0}}>와이스 JSON 동기화</h2>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button disabled={loading||pulling} style={secondaryButtonStyle} onClick={()=>{const w=window.open("https://wyyyes.com/deliverylist","ddoga_wise_order_pull");if(w){setWiseTab(w);setWiseConnected(false)}else setMessage("팝업 차단을 해제해줘.")}}>와이스 연결 탭 열기</button><button style={primaryButtonStyle} disabled={!wiseConnected||loading||pulling} onClick={()=>{wiseTab?.postMessage({type:"DDOGA_WISE_PULL_REQUEST"},"https://wyyyes.com");setPulling(true);setActivity("pull");setMessage("와이스 판매목록 가져오는 중 — 응답을 기다리고 있습니다.");pullTimer.current=setTimeout(()=>{setPulling(false);setActivity("");setMessage("와이스 응답이 60초 동안 없습니다. 연결 탭을 확인한 뒤 다시 가져오기를 눌러주세요.")},60000)}}>{pulling?"전체 주문 가져오는 중…":"와이스 전체 주문 가져오기"}</button></div>
  <p>{wiseConnected?"🟢 와이스 연결됨":"⚪ 와이스 연결 대기"}</p>
  <p>전체 주문 이력을 매출자료로 저장할 수 있습니다. DDOGA 신규 주문 등록은 별도로 선택하며, 기존 합배송은 변경하지 않습니다.</p>
  <input disabled={loading||pulling} type="file" accept=".json,application/json" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setMessage("")}}/>
  <div style={{display:"flex",gap:8,marginTop:16}}>
   <button disabled={!file||loading||pulling} onClick={()=>run("preview")} style={primaryButtonStyle}>{activity==="preview"?"미리보기 가져오는 중…":"미리보기"}</button>
   <button disabled={!file||loading||pulling} onClick={()=>void syncSales()} style={darkButtonStyle}>{activity==="sales_sync"?"매출자료 저장 중…":"매출자료 저장"}</button>
   
  </div>
  <div role="status" aria-live="polite" aria-busy={loading||pulling} style={{marginTop:16,padding:14,borderRadius:10,background:loading||pulling?"#eff6ff":"#f3f4f6",fontWeight:700}}>{loading||pulling?"⏳ 처리 중: ":"현재 상태: "}{message||"대기 중 — 와이스 판매목록을 가져오거나 JSON 파일을 선택해 주세요."}</div>
  {preview&&!(preview.update_candidates?.length)&&<p>전화번호 변경 대상이 없습니다.</p>}
  {preview&&preview.update_candidates?.length>0&&<div style={{marginTop:18,padding:14,border:"1px solid #cbd5e1",borderRadius:12}}>
   <h3>기존 주문 전화번호 추가 대상 ({preview.update_candidates.length}건)</h3>
   <p>변경 대상은 하늘색으로 표시됩니다. 선택한 주문의 빈 전화번호만 채우며 다른 정보는 유지합니다.</p>
   <label><input disabled={loading||pulling} type="checkbox" checked={selectedUpdates.length===preview.update_candidates.length} onChange={e=>setSelectedUpdates(e.target.checked?preview.update_candidates.map(x=>x.candidate_id):[])}/> 전체 선택</label>
   <div style={{maxHeight:340,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
    <thead><tr><th>선택</th><th>닉네임 / 날짜</th><th>와이스 상태</th><th>ddoga 주문</th><th>전화번호 변경</th></tr></thead>
    <tbody>{preview.update_candidates.map(x=><tr key={x.candidate_id} style={{borderTop:"1px solid #cbd5e1",background:x.changes.phone?"#e0f2fe":"transparent"}}><td><input disabled={loading||pulling} type="checkbox" checked={selectedUpdates.includes(x.candidate_id)} onChange={e=>setSelectedUpdates(v=>e.target.checked?[...v,x.candidate_id]:v.filter(id=>id!==x.candidate_id))}/></td><td>{x.nickname} / {new Date(x.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td>{x.wise_status===25?"발송완료 (25)":x.wise_status} / {x.delivery_company==="DIRECT"?"직접배송 (DIRECT)":x.delivery_company||"-"}</td><td>{x.order_id}</td><td><span>{stateText("phone",x.current?.phone)} → <strong style={{display:"inline-block",background:x.changes.phone?"#bae6fd":"transparent",borderRadius:6,padding:x.changes.phone?"4px 8px":"0",color:x.changes.phone?"#075985":"inherit"}}>{stateText("phone",x.changes.phone??x.current?.phone)}</strong></span></td></tr>)}</tbody>
   </table></div>
   <button disabled={loading||pulling||!selectedUpdates.length} onClick={applyUpdates} style={{...darkButtonStyle,marginTop:10}}>{activity==="update"?"기존 주문 변경사항 적용 중…":`선택 ${selectedUpdates.length}건 전화번호 업데이트`}</button>
  </div>}
  {preview&&<div style={{marginTop:18}}>
   <p>전체 {preview.total}건 / 신규 {preview.new_orders.length}건 / 중복 의심 {preview.possible_existing.length}건 / 기존 대기 {preview.already_queued}건</p>
   <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:12}}><label><input disabled={loading||pulling} type="checkbox" checked={(preview.new_orders.length+(preview.queued_orders??[]).filter(o=>!o.existingDomestic).length)>0&&selectedNew.length===preview.new_orders.length+(preview.queued_orders??[]).filter(o=>!o.existingDomestic).length} onChange={e=>setSelectedNew(e.target.checked?[...preview.new_orders,...(preview.queued_orders??[]).filter(o=>!o.existingDomestic)].map(x=>x.wise_order_id):[])}/> 신규 전체 선택 ({selectedNew.length}건)</label><button disabled={loading||pulling||!selectedNew.length} onClick={()=>void run("save")} style={darkButtonStyle}>{activity==="save"?"DDOGA 등록 중…":"DDOGA 등록"}</button></div>
   <div style={{maxHeight:480,overflow:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
    <thead><tr><th>선택</th><th>분류</th><th>주문 ID</th><th>닉네임</th><th>주문시각</th><th>상품수</th></tr></thead>
    <tbody>{[...preview.new_orders.map(o=>({...o,category:"신규"})),...(preview.queued_orders??[]).filter(o=>!o.existingDomestic).map(o=>({...o,category:"기존 대기"})),...preview.possible_existing.map(o=>({...o,category:"중복 의심"}))].map(o=><tr key={o.category+o.wise_order_id} style={{borderTop:"1px solid #ddd",background:o.category==="중복 의심"?"#e5e7eb":"#fef9c3",color:o.category==="중복 의심"?"#6b7280":"#111827"}}>
     <td><input type="checkbox" disabled={loading||pulling||o.category==="중복 의심"} checked={o.category!=="중복 의심"&&selectedNew.includes(o.wise_order_id)} onChange={e=>setSelectedNew(v=>e.target.checked?[...v,o.wise_order_id]:v.filter(id=>id!==o.wise_order_id))}/></td>
     <td>{o.category}</td><td>{o.wise_order_id}</td><td>{o.nickname}</td><td>{new Date(o.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td>{o.items}</td>
    </tr>)}</tbody>
   </table></div>
   <p>중복 의심 주문은 선택할 수 없습니다. 기존 대기 주문도 DDOGA 미등록이면 등록 가능합니다.</p>
  </div>}
 </section>
}
