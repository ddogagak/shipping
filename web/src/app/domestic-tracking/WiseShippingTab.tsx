"use client";
import {useEffect,useState} from "react";
type Row={order_id:string;customer_order_no:string;nickname:string;tracking_number:string};
type Match={order_id:string;nickname:string;tracking_number:string;delivery_id:number;cursor_order_chain_id:number;status:string;reason?:string};
export default function WiseShippingTab(){
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<string[]>([]),[matches,setMatches]=useState<Match[]>([]);
 const [loading,setLoading]=useState(false),[message,setMessage]=useState(""),[connected,setConnected]=useState(false);
 const [tab,setTab]=useState<Window|null>(null);
 useEffect(()=>{
  function onMessage(event:MessageEvent){
   if(event.origin!=="https://wyyyes.com"||event.source!==tab)return;
   const data=event.data;
   if(data?.type==="DDOGA_WISE_SHIP_READY"){setConnected(true);setMessage("와이스 연결됨. 선택한 주문의 매칭을 확인할 수 있어.");}
   if(data?.type==="DDOGA_WISE_SHIP_PREVIEW"){setMatches(Array.isArray(data.matches)?data.matches:[]);setMessage(data.error||"와이스 매칭 결과를 확인해줘.");setLoading(false);}
   if(data?.type==="DDOGA_WISE_SHIP_SYNC"){
    const x=data.row;
    if(!x||!rows.some(r=>r.order_id===x.order_id&&r.tracking_number===x.tracking_number))return;
    void fetch("/api/domestic/wise-shipping",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_id:x.order_id,tracking_number:x.tracking_number,wise_delivery_id:x.delivery_id,wise_success:true})}).then(async r=>{const d=await r.json();tab?.postMessage({type:"DDOGA_WISE_SHIP_SYNC_RESULT",order_id:x.order_id,ok:r.ok&&d.ok,error:d.error},"https://wyyyes.com");}).catch(e=>tab?.postMessage({type:"DDOGA_WISE_SHIP_SYNC_RESULT",order_id:x.order_id,ok:false,error:String(e)},"https://wyyyes.com"));
   }
   if(data?.type==="DDOGA_WISE_SHIP_RESULT"){
    const result=Array.isArray(data.results)?data.results:[];
    setMessage(result.map((x:{nickname:string;ok:boolean;error?:string})=>x.nickname+": "+(x.ok?"와이스 등록 성공":x.error||"실패")).join(" / "));
    setLoading(false);
    void load();
   }
  }
  window.addEventListener("message",onMessage);return()=>window.removeEventListener("message",onMessage);
 },[tab,rows]);
 async function load(){try{const r=await fetch("/api/domestic/wise-shipping",{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"조회 실패");setRows(d.rows||[]);setSelected([]);}catch(e){setMessage(e instanceof Error?e.message:"조회 실패");}}
 useEffect(()=>{void load();},[]);
 function openWise(){
  const w=window.open("https://wyyyes.com/shipping-waiting-user-list","ddoga_wise_shipping");
  if(!w){setMessage("팝업 차단을 해제해줘.");return;}
  setTab(w);setConnected(false);setMessage("와이스 탭이 열렸어. Tampermonkey 연동 스크립트가 설치되어 있어야 연결돼.");
 }
 function preview(){
  if(!tab||tab.closed){setMessage("먼저 와이스 탭을 열어줘.");return;}
  const orders=rows.filter(x=>selected.includes(x.order_id));
  if(!orders.length)return;
  setLoading(true);setMatches([]);
  tab.postMessage({type:"DDOGA_WISE_SHIP_PREVIEW_REQUEST",orders},"https://wyyyes.com");
 }
 function register(){
  const valid=matches.filter(x=>x.status==="ready");
  if(!valid.length)return;
  if(!confirm(valid.length+"건을 와이스에 실제 송장 등록할까? 먼저 1건 테스트를 권장해."))return;
  if(!tab||tab.closed){setMessage("와이스 탭을 다시 열어줘.");return;}
  setLoading(true);tab.postMessage({type:"DDOGA_WISE_SHIP_REGISTER_REQUEST",order_ids:valid.map(x=>x.order_id)},"https://wyyyes.com");
 }
 const btn={border:"1px solid #d1d5db",borderRadius:9,padding:"9px 12px",background:"white",cursor:"pointer",fontWeight:700} as const;
 return <section style={{border:"1px solid #e5e7eb",borderRadius:16,padding:20,background:"white"}}>
  <h2 style={{marginTop:0}}>와이스 송장 연동</h2>
  <p style={{color:"#6b7280"}}>ddoga 미등록 송장을 조회하고, 와이스에서 닉네임으로 배송을 찾아 등록해. 와이스 성공 확인 후에만 ddoga 상태를 변경해.</p>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
   <button style={btn} onClick={()=>void load()}>대상 새로고침</button>
   <button style={btn} onClick={openWise}>와이스 연결 탭 열기</button>
   <button style={btn} disabled={!selected.length||!connected||loading} onClick={preview}>선택 {selected.length}건 매칭 미리보기</button>
  </div>
  <p>{connected?"🟢 와이스 연결됨":"⚪ 와이스 연결 대기"} · 대상 {rows.length}건 · 선택 {selected.length}건</p>
  {message&&<p role="status" style={{fontWeight:700}}>{message}</p>}
  <div style={{overflowX:"auto",maxHeight:460,overflowY:"auto"}}>
   <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr><th><input aria-label="전체 선택" type="checkbox" checked={rows.length>0&&selected.length===rows.length} onChange={e=>setSelected(e.target.checked?rows.map(x=>x.order_id):[])}/></th><th>닉네임</th><th>주문번호</th><th>로젠 송장번호</th></tr></thead><tbody>
   {rows.map(x=><tr key={x.order_id} style={{borderTop:"1px solid #eee"}}><td><input type="checkbox" checked={selected.includes(x.order_id)} onChange={e=>setSelected(v=>e.target.checked?[...v,x.order_id]:v.filter(id=>id!==x.order_id))}/></td><td>{x.nickname}</td><td>{x.customer_order_no||x.order_id}</td><td>{x.tracking_number}</td></tr>)}
   </tbody></table>
  </div>
  {matches.length>0&&<div style={{marginTop:20}}><h3>와이스 매칭 미리보기</h3><table style={{width:"100%",fontSize:13}}><thead><tr><th>닉네임</th><th>송장번호</th><th>배송 ID</th><th>결과</th></tr></thead><tbody>{matches.map(x=><tr key={x.order_id}><td>{x.nickname}</td><td>{x.tracking_number}</td><td>{x.delivery_id||"-"}</td><td>{x.reason||x.status}</td></tr>)}</tbody></table><button style={{...btn,marginTop:14,background:"#111827",color:"white"}} disabled={loading||!matches.some(x=>x.status==="ready")} onClick={register}>매칭 성공 건 와이스 송장 등록</button></div>}
 </section>;
