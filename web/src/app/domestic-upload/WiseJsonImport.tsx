"use client";
import {useEffect,useState} from "react";
const primaryButtonStyle={border:0,borderRadius:10,padding:"10px 14px",background:"#2563eb",color:"#fff",fontWeight:800,cursor:"pointer"} as const;
const darkButtonStyle={border:0,borderRadius:10,padding:"10px 14px",background:"#111827",color:"#fff",fontWeight:800,cursor:"pointer"} as const;
const secondaryButtonStyle={border:"1px solid #d1d5db",borderRadius:10,padding:"9px 14px",background:"#fff",color:"#374151",fontWeight:700,cursor:"pointer"} as const;
type UpdateCandidate={wise_order_id:number;order_id:string;nickname:string;ordered_at:string;wise_status:number;delivery_company:string|null;tracking_number:string;changes:Record<string,string|boolean>};
type Candidate={wise_order_id:number;nickname:string;ordered_at:string;items:number;existingDomestic:boolean;alreadyQueued:boolean;matched_order_ids:string[]};
export default function WiseJsonImport(){
 const [file,setFile]=useState<File|null>(null);
 const [wiseTab,setWiseTab]=useState<Window|null>(null);
 const [wiseConnected,setWiseConnected]=useState(false);
 useEffect(()=>{
  const allowedOrigin="https://wyyyes.com";
  function onMessage(event:MessageEvent){
   if(event.origin!==allowedOrigin||(event.source!==window.opener&&event.source!==wiseTab))return;
   const data=event.data;
   if(data?.type==="DDOGA_WISE_PULL_READY"){setWiseConnected(true);setMessage("와이스 연결됨");return;}
   if(data?.type==="DDOGA_WISE_PULL_ERROR"){setMessage(String(data.error||"조회 실패"));return;}
   if(data?.type==="DDOGA_WISE_PING"){
    (event.source as Window).postMessage({type:"DDOGA_WISE_READY"},allowedOrigin);
    return;
   }
   if(data?.type!=="DDOGA_WISE_ORDERS"||!Array.isArray(data.orders))return;
   if(data.orders.length>20000||!data.orders.every((o:unknown)=>o!==null&&typeof o==="object"&&Number.isSafeInteger((o as {id?:number}).id)&&Array.isArray((o as {stocks?:unknown}).stocks)))return;
   const json=JSON.stringify(data.orders);
   if(json.length>15000000){setMessage("전송된 JSON이 15MB를 초과합니다.");return;}
   setFile(new File([json],"wyyyes-orders.json",{type:"application/json"}));
   setPreview(null);
   setSelectedUpdates([]);
   setMessage("와이스 주문 "+data.orders.length+"건을 받았어. 미리보기를 눌러 확인해 줘. DB는 아직 변경하지 않았어.");
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
 const [selectedUpdates,setSelectedUpdates]=useState<number[]>([]);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [preview,setPreview]=useState<{total:number;new_orders:Candidate[];possible_existing:Candidate[];queued_orders:Candidate[];already_queued:number;update_candidates:UpdateCandidate[]}|null>(null);
 async function run(mode:"preview"|"save"){
  if(!file)return;
  if(mode==="save"&&(!selectedNew.length||!confirm(`선택 ${selectedNew.length}건을 등록할까?`)))return;
  setLoading(true);setMessage("");
  try{
   const form=new FormData();form.append("file",file);form.append("mode",mode);if(mode==="save")form.append("selected_ids",JSON.stringify(selectedNew));
   const res=await fetch("/api/domestic/wise-json-import",{method:"POST",body:form});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"업로드 실패");
   if(mode==="preview"){setPreview(data);setSelectedNew(data.new_orders.map((x:Candidate)=>x.wise_order_id));setSelectedUpdates((data.update_candidates??[]).map((x:UpdateCandidate)=>x.wise_order_id));setMessage("미리보기 완료. 기존 주문 추정은 닉네임+주문시각 기준이며 확인이 필요합니다.");}
   else{const response=await fetch("/api/domestic/wise-json-queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve_bulk",wise_order_ids:selectedNew})});const result=await response.json();if(!response.ok)throw new Error(result.error||"일괄 등록 실패");setPreview(null);setSelectedNew([]);setMessage(`등록 성공 ${result.saved}건 / 실패 ${result.failed}건`+(result.failed?" : "+result.results.filter((x:{ok:boolean})=>!x.ok).map((x:{wise_order_id:number;error:string})=>x.wise_order_id+" "+x.error).join(", "):""));}
  }catch(e){setMessage(e instanceof Error?e.message:"알 수 없는 오류")}finally{setLoading(false)}
 }
 async function applyUpdates(){
  if(!file||!selectedUpdates.length)return;
  if(!confirm(`선택한 ${selectedUpdates.length}건의 기존 주문 상태를 변경할까요?`))return;
  setLoading(true);
  try{
   const form=new FormData();form.append("file",file);form.append("mode","apply_updates");form.append("selected_ids",JSON.stringify(selectedUpdates));
   const r=await fetch("/api/domestic/wise-json-import",{method:"POST",body:form});const d=await r.json();
   if(!r.ok)throw new Error(d.error||"변경 실패");
   setMessage(`상태 업데이트 완료 ${d.updated}건 / 실패 ${d.failed}건`+(d.failed?" — "+d.results.filter((x:{ok:boolean})=>!x.ok).map((x:{order_id:string;error:string})=>x.order_id+": "+x.error).join(", "):""));
   setSelectedUpdates([]);
  }catch(e){setMessage(e instanceof Error?e.message:"변경 실패")}finally{setLoading(false)}
 }
 return <section style={{border:"1px solid #e5e7eb",borderRadius:16,padding:20,background:"#fff",marginTop:16}}>
  <h2 style={{marginTop:0}}>와이스 JSON 동기화</h2>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={secondaryButtonStyle} onClick={()=>{const w=window.open("https://wyyyes.com/deliverylist","ddoga_wise_order_pull");if(w){setWiseTab(w);setWiseConnected(false)}else setMessage("팝업 차단을 해제해줘.")}}>와이스 연결 탭 열기</button><button style={primaryButtonStyle} disabled={!wiseConnected||loading} onClick={()=>{wiseTab?.postMessage({type:"DDOGA_WISE_PULL_REQUEST"},"https://wyyyes.com");setMessage("와이스 주문 조회 중...")}}>와이스 판매목록 가져오기 (40건)</button></div>
  <p>{wiseConnected?"🟢 와이스 연결됨":"⚪ 와이스 연결 대기"}</p>
  <p>JSON에서 새 주문을 검토 대기열에 추가하고, 모든 주문의 와이스 전용 배송/상태 스냅샷과 상품정보를 갱신합니다. 기존 ddoga 주문과 합배송은 수정하지 않습니다.</p>
  <input type="file" accept=".json,application/json" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setMessage("")}}/>
  <div style={{display:"flex",gap:8,marginTop:16}}>
   <button disabled={!file||loading} onClick={()=>run("preview")} style={primaryButtonStyle}>미리보기</button>
   <button disabled={!file||loading||!preview||!selectedNew.length} onClick={()=>run("save")} style={darkButtonStyle}>선택 {selectedNew.length}건 DDOGA 등록</button>
  </div>
  {message&&<p>{message}</p>}
  {preview&&preview.update_candidates?.length>0&&<div style={{marginTop:18,padding:14,border:"1px solid #cbd5e1",borderRadius:12}}>
   <h3>기존 주문 상태 업데이트 대상 ({preview.update_candidates.length}건)</h3>
   <p>체크한 항목만 ddoga 주문/배송 상태를 수정합니다. 신규 주문 등록과 별개입니다.</p>
   <label><input type="checkbox" checked={selectedUpdates.length===preview.update_candidates.length} onChange={e=>setSelectedUpdates(e.target.checked?preview.update_candidates.map(x=>x.wise_order_id):[])}/> 전체 선택</label>
   <div style={{maxHeight:340,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
    <thead><tr><th>선택</th><th>닉네임 / 날짜</th><th>와이스 상태</th><th>ddoga 주문</th><th>변경 내용</th></tr></thead>
    <tbody>{preview.update_candidates.map(x=><tr key={x.wise_order_id} style={{borderTop:"1px solid #eee"}}><td><input type="checkbox" checked={selectedUpdates.includes(x.wise_order_id)} onChange={e=>setSelectedUpdates(v=>e.target.checked?[...v,x.wise_order_id]:v.filter(id=>id!==x.wise_order_id))}/></td><td>{x.nickname} / {new Date(x.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td>{x.wise_status} / {x.delivery_company||"-"}</td><td>{x.order_id}</td><td>{Object.entries(x.changes).map(([k,v])=>k==="tracking_registered"?"등록 Y":k==="shipping_status"?"배송상태 운송장등록":k==="order_status"?"주문상태 "+(v==="kept"?"직배킵":v==="done"?"완료":v):k+" "+v).join(" / ")}</td></tr>)}</tbody>
   </table></div>
   <button disabled={loading||!selectedUpdates.length} onClick={applyUpdates} style={{...darkButtonStyle,marginTop:10}}>선택 {selectedUpdates.length}건 상태 업데이트</button>
  </div>}
  {preview&&<><p>전체 {preview.total}건 / 신규 후보 {preview.new_orders.length}건 / 기존 주문 추정 {preview.possible_existing.length}건 / 이미 대기열 등록 {preview.already_queued}건</p>
   <div style={{maxHeight:480,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
    <thead><tr><th>분류</th><th>와이스 주문 ID</th><th>닉네임</th><th>주문시각</th><th>상품수</th><th>매칭된 ddoga 주문</th></tr></thead>
    <tbody>{[...preview.new_orders.map(o=>({...o,category:"신규 후보"})),...preview.possible_existing.map(o=>({...o,category:"기존 주문 중복 추정"})),...(preview.queued_orders??[]).filter(o=>!o.existingDomestic).map(o=>({...o,category:"이미 대기열 등록"}))].map(o=><tr key={o.category+o.wise_order_id} style={{borderTop:"1px solid #ddd",background:o.existingDomestic?"#fff7ed":o.alreadyQueued?"#f1f5f9":"white"}}><td>{o.category}</td><td>{o.wise_order_id}</td><td>{o.nickname}</td><td>{new Date(o.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td>{o.items}</td><td>{o.matched_order_ids?.join(", ")||"-"}</td></tr>)}</tbody>
   </table></div>
   <p style={{color:"#9a3412"}}>기존 주문은 닉네임+주문시각으로 추정합니다. 신규 후보도 중복 가능성이 있으니 확인하세요. JSON 저장 후 아래 대기열에서 주문별로 ddoga 등록할 수 있습니다.</p>
  </>}
  <div style={{marginTop:24,borderTop:"1px solid #ddd",paddingTop:16}}>
   <h3>신규 주문 검토 대기열</h3>
   <button onClick={loadQueue} style={secondaryButtonStyle}>대기열 조회 / 새로고침</button>
   {queueError&&<p style={{color:"#b91c1c"}}>{queueError}</p>}
   <div style={{maxHeight:450,overflow:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse"}}>
    <thead><tr><th>주문 ID</th><th>닉네임</th><th>주문시각</th><th>상품</th><th>금액</th><th>처리</th></tr></thead>
    <tbody>{queue.map(o=><tr key={o.wise_order_id}><td>{o.wise_order_id}</td><td>{o.buyer_nickname}</td><td>{new Date(o.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td title={o.item_summary}>{o.item_count}개 / {o.item_summary?.slice(0,40)}</td><td>{Number(o.item_total_price).toLocaleString()}원</td><td><button onClick={()=>handleQueue(o.wise_order_id,"approve")} style={darkButtonStyle}>ddoga 등록</button> <button onClick={()=>handleQueue(o.wise_order_id,"ignore")} style={secondaryButtonStyle}>제외</button></td></tr>)}</tbody>
   </table></div>
   <p>주문별 등록 후 국내 주문 목록에서 수동 합배송하세요. 기존 주문과 중복이 의심되면 등록을 막습니다.</p>
  </div>
 </section>
}
