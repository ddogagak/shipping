"use client";
import { useState } from "react";
export async function saveSaleUnits(ids:string[], units:number) {
  const res=await fetch("/api/sales-management/sale-links",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"set_units",stock_ids:ids,sale_units:units})});
  const data=await res.json();
  if(!res.ok||!data.ok)throw new Error(data.message||"판매 수량 저장 실패");
  return data;
}
export default function SaleUnitsEditor({units,disabled,onSave,bulk=false}:{units:number;disabled?:boolean;onSave:(n:number)=>Promise<void>;bulk?:boolean}){
  const [draft,setDraft]=useState<string|null>(null);
  const n=Number(draft);
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
    <input aria-label={bulk?"선택 판매 건당 실제 판매 수량":"실제 판매 수량"} type="number" min={1} max={9999} step={1} value={draft??String(units)} onChange={e=>setDraft(e.target.value)} disabled={disabled} style={{width:62,padding:"5px",border:"1px solid #cbd5e1",borderRadius:6}}/>
    <button type="button" style={{padding:"5px 8px",border:"1px solid #93c5fd",borderRadius:6,background:"#eff6ff",color:"#1d4ed8",fontWeight:700}} disabled={disabled||draft===null||!Number.isSafeInteger(n)||n<1||n>9999} onClick={async()=>{await onSave(n);setDraft(null);}}>{bulk?"일괄 저장":"저장"}</button>
  </span>;
}
