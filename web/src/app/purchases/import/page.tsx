"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import TaobaoImportPanel from "./TaobaoImportPanel";
import TextImportPanel from "./TextImportPanel";

type Mode="china"|"korea"|"japan"|"simple";

export default function PurchaseImport(){
 const[mode,setMode]=useState<Mode>("china");
 const [simpleEntries,setSimpleEntries]=useState<any[]>([]);
 const [simpleId,setSimpleId]=useState("");
 const [simpleMessage,setSimpleMessage]=useState("");
 useEffect(()=>{if(mode!=="simple")return;let cancelled=false;fetch("/api/purchases/simple",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.message||"간이 내역 조회 실패");if(!cancelled){setSimpleEntries(j.entries||[]);setSimpleId(prev=>(j.entries||[]).some((e:any)=>e.id===prev)?prev:"");setSimpleMessage("");}}).catch(e=>{if(!cancelled)setSimpleMessage(e instanceof Error?e.message:"간이 내역 조회 실패")});return()=>{cancelled=true};},[mode]);
 const selectedSimple=simpleEntries.find(e=>e.id===simpleId && !e.purchase_registered && !e.converted);
 return <main style={page}>
  <header style={header}>
   <div><h1 style={{margin:0}}>매입 등록</h1><p style={sub}>중국 · 한국 · 일본 · 간이 매입 자료를 매입관리에 등록합니다.</p></div>
   <div style={topLinks}><Link href="/purchases" style={link}>매입관리</Link><Link href="/sale-inventory" style={link}>방송판매재고</Link></div>
  </header>
  <div style={tabs}>
   <button style={mode==="china"?activeTab:tab} onClick={()=>setMode("china")}>🇨🇳 중국 · 타오바오</button>
   <button style={mode==="korea"?activeTab:tab} onClick={()=>setMode("korea")}>🇰🇷 한국 · 명세서 텍스트</button>
   <button style={mode==="japan"?activeTab:tab} onClick={()=>setMode("japan")}>🇯🇵 일본 · 구매대행 텍스트</button>
   <button style={mode==="simple"?activeTab:tab} onClick={()=>setMode("simple")}>🧾 간이 가져오기</button>
  </div>
  {mode==="china"?<TaobaoImportPanel/>:mode==="simple"?<>
    <section style={{padding:16,border:"1px solid #e5e7eb",borderRadius:10,marginBottom:14,background:"#fff"}}>
      <h2 style={{margin:"0 0 8px",fontSize:18}}>간이 내역 선택 → 한국 매입으로 전환</h2>
      <p style={sub}>매입 등록 완료 N인 간이를 선택하고 상품행을 추가해. 최종 등록하면 한국 매입에 연결되고, 간이 기록은 매입 등록 완료 Y로 남아 거래처 입금·계산서 확인에 사용할 수 있어.</p>
      <select aria-label="전환할 간이 매입 선택" value={simpleId} onChange={e=>setSimpleId(e.target.value)} style={{width:"100%",maxWidth:700,padding:12,border:"1px solid #cbd5e1",borderRadius:8,marginTop:12}}>
        <option value="">전환할 간이 내역을 선택해줘</option>
        {simpleEntries.filter(e=>!e.purchase_registered && !e.converted).map(e=><option key={e.id} value={e.id}>{e.shop_name||"거래처 미입력"} · {Number(e.paid_amount||0).toLocaleString("ko-KR")}원 · {e.category||"매입"} · {e.ordered_at?new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(e.ordered_at)):"날짜 없음"}</option>)}
      </select>
      {simpleMessage&&<p style={{color:"#be123c"}}>{simpleMessage}</p>}
      {!simpleEntries.some(e=>!e.purchase_registered&&!e.converted)&&<p style={sub}>전환할 간이 매입이 없어. <Link href="/purchases/simple">간이 매입 등록하기</Link></p>}
    </section>
    {selectedSimple&&<TextImportPanel key={simpleId} mode="korea" simpleEntry={selectedSimple}/>}
   </>:<TextImportPanel key={mode} mode={mode}/>} 
 </main>;
}

const page={maxWidth:1120,margin:"0 auto",padding:24,fontFamily:"Arial, sans-serif"};
const header={display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap" as const};
const sub={margin:"7px 0 0",color:"#6b7280",fontSize:14};
const topLinks={display:"flex",gap:8};
const link={padding:"9px 12px",border:"1px solid #cbd5e1",borderRadius:9,textDecoration:"none",color:"#111",fontWeight:700};
const tabs={display:"flex",gap:8,margin:"24px 0 12px",flexWrap:"wrap" as const};
const tab={padding:"11px 18px",border:"1px solid #94a3b8",borderRadius:10,background:"white",fontWeight:800,cursor:"pointer"};
const activeTab={...tab,background:"#111827",color:"white",borderColor:"#111827"};
