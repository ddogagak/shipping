"use client";
import {useState} from "react";
type Candidate={wise_order_id:number;nickname:string;ordered_at:string;items:number;existingDomestic:boolean;alreadyQueued:boolean;matched_order_ids:string[]};
export default function WiseJsonImport(){
 const [file,setFile]=useState<File|null>(null);
 const [queue,setQueue]=useState<Array<{wise_order_id:number;buyer_nickname:string;ordered_at:string;item_summary:string;item_count:number;item_total_price:number}>>([]);
 const [queueError,setQueueError]=useState("");
 async function loadQueue(){try{const r=await fetch("/api/domestic/wise-json-queue");const d=await r.json();if(!r.ok)throw new Error(d.error);setQueue(d.orders??[]);setQueueError("");}catch(e){setQueueError(e instanceof Error?e.message:"조회 실패")}}
 async function handleQueue(id:number,action:"approve"|"ignore"){if(!confirm(action==="approve"?"이 신규 주문을 ddoga 주문으로 등록할까요?":"이 주문을 대기열에서 제외할까요?"))return;try{const r=await fetch("/api/domestic/wise-json-queue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({wise_order_id:id,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);await loadQueue();setMessage(action==="approve"?`주문 등록 완료: ${d.order_id}`:"대기열에서 제외했습니다.");}catch(e){setMessage(e instanceof Error?e.message:"처리 실패")}}
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [preview,setPreview]=useState<{total:number;new_orders:Candidate[];possible_existing:Candidate[];queued_orders:Candidate[];already_queued:number}|null>(null);
 async function run(mode:"preview"|"save"){
  if(!file)return;
  if(mode==="save"&&!confirm("와이스 주문 스냅샷을 갱신하고 신규 주문을 검토 대기열에 등록할까요? ddoga 주문/배송 데이터는 수정하지 않습니다."))return;
  setLoading(true);setMessage("");
  try{
   const form=new FormData();form.append("file",file);form.append("mode",mode);
   const res=await fetch("/api/domestic/wise-json-import",{method:"POST",body:form});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"업로드 실패");
   if(mode==="preview"){setPreview(data);setMessage("미리보기 완료. 기존 주문 추정은 닉네임+주문시각 기준이며 확인이 필요합니다.");}
   else{setPreview(null);setMessage(`저장 완료: 신규 검토 대기 ${data.queued_new}건 / 와이스 스냅샷 ${data.updated_snapshots}건 / 상품 ${data.updated_items}건. ddoga 주문/배송정보 변경 없음.`);}
  }catch(e){setMessage(e instanceof Error?e.message:"알 수 없는 오류")}finally{setLoading(false)}
 }
 return <section style={{border:"1px solid #e5e7eb",borderRadius:16,padding:20,background:"#fff",marginTop:16}}>
  <h2 style={{marginTop:0}}>와이스 JSON 동기화</h2>
  <p>JSON에서 새 주문을 검토 대기열에 추가하고, 모든 주문의 와이스 전용 배송/상태 스냅샷과 상품정보를 갱신합니다. 기존 ddoga 주문과 합배송은 수정하지 않습니다.</p>
  <input type="file" accept=".json,application/json" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);setMessage("")}}/>
  <div style={{display:"flex",gap:8,marginTop:16}}>
   <button disabled={!file||loading} onClick={()=>run("preview")} style={{padding:"10px 16px",borderRadius:8}}>미리보기</button>
   <button disabled={!file||loading||!preview} onClick={()=>run("save")} style={{padding:"10px 16px",borderRadius:8,background:"#7c3aed",color:"white",border:0}}>와이스 DB 갱신 + 신규 대기 등록</button>
  </div>
  {message&&<p>{message}</p>}
  {preview&&<><p>전체 {preview.total}건 / 신규 후보 {preview.new_orders.length}건 / 기존 주문 추정 {preview.possible_existing.length}건 / 이미 대기열 등록 {preview.already_queued}건</p>
   <div style={{maxHeight:480,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
    <thead><tr><th>분류</th><th>와이스 주문 ID</th><th>닉네임</th><th>주문시각</th><th>상품수</th><th>매칭된 ddoga 주문</th></tr></thead>
    <tbody>{[...preview.new_orders.map(o=>({...o,category:"신규 후보"})),...preview.possible_existing.map(o=>({...o,category:"기존 주문 중복 추정"})),...(preview.queued_orders??[]).filter(o=>!o.existingDomestic).map(o=>({...o,category:"이미 대기열 등록"}))].map(o=><tr key={o.category+o.wise_order_id} style={{borderTop:"1px solid #ddd",background:o.existingDomestic?"#fff7ed":o.alreadyQueued?"#f1f5f9":"white"}}><td>{o.category}</td><td>{o.wise_order_id}</td><td>{o.nickname}</td><td>{new Date(o.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td>{o.items}</td><td>{o.matched_order_ids?.join(", ")||"-"}</td></tr>)}</tbody>
   </table></div>
   <p style={{color:"#9a3412"}}>기존 주문은 닉네임+주문시각으로 추정합니다. 신규 후보도 중복 가능성이 있으니 확인하세요. JSON 저장 후 아래 대기열에서 주문별로 ddoga 등록할 수 있습니다.</p>
  </>}
  <div style={{marginTop:24,borderTop:"1px solid #ddd",paddingTop:16}}>
   <h3>신규 주문 검토 대기열</h3>
   <button onClick={loadQueue} style={{padding:"8px 14px"}}>대기열 조회 / 새로고침</button>
   {queueError&&<p style={{color:"#b91c1c"}}>{queueError}</p>}
   <div style={{maxHeight:450,overflow:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse"}}>
    <thead><tr><th>주문 ID</th><th>닉네임</th><th>주문시각</th><th>상품</th><th>금액</th><th>처리</th></tr></thead>
    <tbody>{queue.map(o=><tr key={o.wise_order_id}><td>{o.wise_order_id}</td><td>{o.buyer_nickname}</td><td>{new Date(o.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td title={o.item_summary}>{o.item_count}개 / {o.item_summary?.slice(0,40)}</td><td>{Number(o.item_total_price).toLocaleString()}원</td><td><button onClick={()=>handleQueue(o.wise_order_id,"approve")}>ddoga 등록</button> <button onClick={()=>handleQueue(o.wise_order_id,"ignore")}>제외</button></td></tr>)}</tbody>
   </table></div>
   <p>주문별 등록 후 국내 주문 목록에서 수동 합배송하세요. 기존 주문과 중복이 의심되면 등록을 막습니다.</p>
  </div>
 </section>
}
