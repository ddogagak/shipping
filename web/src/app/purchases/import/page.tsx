"use client";
import Link from "next/link";
import {useState} from "react";
import TaobaoImportPanel from "./TaobaoImportPanel";
import TextImportPanel from "./TextImportPanel";

type Mode="china"|"korea"|"japan";

export default function PurchaseImport(){
 const[mode,setMode]=useState<Mode>("china");
 return <main style={page}>
  <header style={header}>
   <div><h1 style={{margin:0}}>매입 등록</h1><p style={sub}>중국 · 한국 · 일본 매입 자료를 매입관리에 등록합니다.</p></div>
   <div style={topLinks}><Link href="/purchases" style={link}>매입관리</Link><Link href="/sale-inventory" style={link}>방송판매재고</Link></div>
  </header>
  <div style={tabs}>
   <button style={mode==="china"?activeTab:tab} onClick={()=>setMode("china")}>🇨🇳 중국 · 타오바오</button>
   <button style={mode==="korea"?activeTab:tab} onClick={()=>setMode("korea")}>🇰🇷 한국 · 명세서 텍스트</button>
   <button style={mode==="japan"?activeTab:tab} onClick={()=>setMode("japan")}>🇯🇵 일본 · 구매대행 텍스트</button>
  </div>
  {mode==="china"?<TaobaoImportPanel/>:<TextImportPanel key={mode} mode={mode}/>} 
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
