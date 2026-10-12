"use client";
import {useState} from "react";
type Candidate={wise_order_id:number;nickname:string;ordered_at:string;items:number;existingDomestic:boolean;alreadyQueued:boolean};
export default function WiseJsonImport(){
 const [file,setFile]=useState<File|null>(null);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [preview,setPreview]=useState<{total:number;new_orders:Candidate[];possible_existing:Candidate[];already_queued:number}|null>(null);
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
   <div style={{maxHeight:420,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th>와이스 주문 ID</th><th>닉네임</th><th>주문시각</th><th>상품수</th></tr></thead><tbody>{preview.new_orders.map(o=><tr key={o.wise_order_id}><td>{o.wise_order_id}</td><td>{o.nickname}</td><td>{new Date(o.ordered_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</td><td>{o.items}</td></tr>)}</tbody></table></div>
   <p style={{color:"#9a3412"}}>주의: 기존 주문 추정에 실패한 주문이 신규 후보로 표시될 수 있습니다. 신규 대기열을 실제 국내 주문으로 전환하는 기능은 아직 연결하지 않았습니다.</p>
  </>}
 </section>
}
