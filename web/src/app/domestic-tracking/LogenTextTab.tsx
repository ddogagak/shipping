"use client";
import {useState} from "react";
type Entry={id:number;name:string;phone:string;tracking_number:string;print_count:number;match_status:string;reason:string;order_id:string;db_name:string;nickname:string};
export default function LogenTextTab(){
 const [value,setValue]=useState("");
 const [rows,setRows]=useState<Entry[]>([]);
 const [checked,setChecked]=useState<number[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function run(mode:"preview"|"apply"){
  if(mode==="apply"&&!checked.length)return;
  if(mode==="apply"&&!confirm(`선택한 ${checked.length}건의 비어 있는 송장번호만 DDOGA에 입력할까요?`))return;
  setBusy(true);setMessage("");
  try{
   const res=await fetch("/api/domestic/tracking/text",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,text:value,selected_ids:checked})});
   const result=await res.json();
   if(!res.ok)throw Error(result.detail||result.error||"처리 실패");
   if(mode==="preview"){
    setRows(result.rows||[]);setChecked((result.rows||[]).filter((r:Entry)=>r.match_status==="ready").map((r:Entry)=>r.id));
    setMessage(`총 ${result.total}건 확인 · 반영 가능 ${result.ready}건`);
   }else{
    setMessage(`실제 DB 저장 확인 ${result.updated}건 · 실패 ${result.failed}건`+(result.failed?" — 실패한 건은 다시 미리보기로 확인해 줘.":""));
    const ok=new Set((result.results||[]).filter((r:{ok:boolean})=>r.ok).map((r:{id:number})=>r.id));
    setRows(prev=>prev.filter(r=>!ok.has(r.id)));setChecked(prev=>prev.filter(id=>!ok.has(id)));
   }
  }catch(e){setMessage(e instanceof Error?e.message:"처리 실패");}finally{setBusy(false)}
 }
 const btn={border:0,borderRadius:8,padding:"9px 14px",fontWeight:700,cursor:"pointer",background:"#2563eb",color:"#fff"} as const;
 return <section style={{border:"1px solid #d1d5db",borderRadius:12,padding:16}}>
  <h2 style={{marginTop:0}}>로젠 출력내역 텍스트 반영</h2>
  <p>로젠에서 복사한 고객명·연락처·송장출력·운송장번호·출력횟수 목록을 그대로 붙여넣어 줘. <b>포장완료 / 배송완료 아님 / 기존 운송장 공백</b> 주문만 이름으로 찾아.</p>
  <textarea aria-label="로젠 출력내역" value={value} onChange={e=>{setValue(e.target.value);setRows([]);setChecked([])}} placeholder="고객명 연락처 진행상태 운송장번호 출력횟수..." rows={7} style={{width:"100%",boxSizing:"border-box",border:"1px solid #cbd5e1",borderRadius:8,padding:12}}/>
  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,flexWrap:"wrap"}}><button style={btn} disabled={!value.trim()||busy} onClick={()=>void run("preview")}>이름으로 매칭 미리보기</button><button style={{...btn,background:"#111827"}} disabled={!checked.length||busy} onClick={()=>void run("apply")}>선택 {checked.length}건 송장 저장</button></div>
  {message&&<p role="status" style={{fontWeight:700}}>{message}</p>}
  {rows.length>0&&<div style={{overflowX:"auto",marginTop:14}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
   <thead><tr><th>선택</th><th>로젠 고객명</th><th>DDOGA 이름·닉네임</th><th>주문 ID</th><th>운송장번호</th><th>매칭 결과</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id} style={{borderTop:"1px solid #e2e8f0",background:row.match_status==="ready"?"#e0f2fe":"#fff"}}>
    <td><input type="checkbox" disabled={row.match_status!=="ready"||busy} checked={checked.includes(row.id)} onChange={e=>setChecked(prev=>e.target.checked?[...prev,row.id]:prev.filter(id=>id!==row.id))}/></td>
    <td>{row.name}</td><td>{row.db_name||"-"} / {row.nickname||"-"}</td><td>{row.order_id||"-"}</td><td>{row.tracking_number}</td><td>{row.reason}</td>
   </tr>)}</tbody>
  </table></div>}
 </section>
}
