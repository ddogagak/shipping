"use client";
import { useState } from "react";

export default function DomesticTrackingPage(){
  const [raw,setRaw]=useState("");
  const [rows,setRows]=useState<any[]>([]);

  function parseInput(){
    const parsed=raw.split(/\n/).map(l=>l.trim()).filter(Boolean).map((l)=>{const p=l.split(',').map(v=>v.trim()); return {order_id_input:p[0]||'',recipient_name:p[1]||'',phone:p[2]||'',address:p[3]||'',tracking_number:p[4]||''};});
    setRows(parsed);
  }

  async function preview(){
    const r=await fetch('/api/domestic/tracking/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})});
    const j=await r.json(); if(r.ok) setRows(j.rows||[]);
  }
  async function update(){
    const selected=rows.filter(r=>r.selected);
    await fetch('/api/domestic/tracking/update',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:selected})});
  }

  return <main><div className='card'>
    <h1 style={{marginTop:0}}>Domestic Tracking Upload</h1>
    <p>형식: 고객주문번호,수취인명,전화번호,주소일부,운송장번호</p>
    <textarea style={{width:'100%',minHeight:140}} value={raw} onChange={e=>setRaw(e.target.value)} />
    <div style={{display:'flex',gap:8,marginTop:8}}><button onClick={parseInput}>입력 파싱</button><button onClick={preview} disabled={!rows.length}>매칭 미리보기</button><button onClick={update} disabled={!rows.some(r=>r.selected)}>선택 업데이트</button></div>
    <div className='table-wrap'><table><thead><tr><th>선택</th><th>order_id_input</th><th>recipient_name</th><th>phone</th><th>address</th><th>tracking</th><th>status</th><th>matched_order_id</th></tr></thead><tbody>
      {rows.map((r,i)=><tr key={i}><td><input type='checkbox' checked={!!r.selected} onChange={e=>setRows(prev=>prev.map((x,j)=>j===i?{...x,selected:e.target.checked}:x))}/></td><td>{r.order_id_input}</td><td>{r.recipient_name}</td><td>{r.phone}</td><td>{r.address}</td><td><input value={r.tracking_number||''} onChange={e=>setRows(prev=>prev.map((x,j)=>j===i?{...x,tracking_number:e.target.value}:x))}/></td><td>{r.match_status||''}</td><td>{r.matched_order_id||''}</td></tr>)}
    </tbody></table></div>
  </div></main>;
}
