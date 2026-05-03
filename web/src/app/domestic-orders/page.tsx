"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toDomesticExcelRows } from "@/lib/domestic/parser";

const P = ["wise","x","bunjang"];
const O = ["accepted","checked","done"];
const S = ["start","excel_exported","uploaded","done"];

export default function DomesticOrdersPage(){
  const [rows,setRows]=useState<any[]>([]);
  const [platforms,setPlatforms]=useState<string[]>([]);
  const [orderStatuses,setOrderStatuses]=useState<string[]>([]);
  const [shippingStatuses,setShippingStatuses]=useState<string[]>([]);

  async function load(){
    const q=new URLSearchParams({platforms:platforms.join(','),orderStatuses:orderStatuses.join(','),shippingStatuses:shippingStatuses.join(',')}).toString();
    const r=await fetch(`/api/domestic/orders?${q}`); const j=await r.json(); if(r.ok) setRows((j.rows||[]).map((x:any)=>({...x,selected:false}))); }
  useEffect(()=>{void load();},[platforms.join(','),orderStatuses.join(','),shippingStatuses.join(',')]);

  const selected=useMemo(()=>rows.filter(r=>r.selected),[rows]);
  const toggle=(arr:string[],v:string,set:any)=>set(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);

  async function bulk(action:string){ await fetch('/api/domestic/orders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderIds:selected.map(r=>r.order_id),action})}); await load(); }
  async function exportExcel(){
    const domRows=selected.map((r:any)=>({selected:true,platform:r.platform,order_id:r.order_id,source_order_dates:r.source_order_dates||[],first_order_date:r.first_order_date||'',nickname:r.nickname||'',recipient_name:r.recipient_name||'',phone:r.phone||'',postal_code:r.postal_code||'',address:r.address||'',order_count:r.order_count||1,item_texts:(r.domestic_order_item||[]).map((i:any)=>i.item_text),item_total_price:r.item_total_price||0}));
    const ws=XLSX.utils.json_to_sheet(toDomesticExcelRows(domRows as any)); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Domestic'); XLSX.writeFile(wb,`domestic_orders_${Date.now()}.xlsx`);
    await fetch('/api/domestic/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderIds:selected.map(r=>r.order_id)})});
    await load();
  }

  return <main><div className='card'>
    <h1 style={{marginTop:0}}>Domestic Orders</h1>
    <div style={{display:'grid',gap:8}}>
      <div>플랫폼: <button onClick={()=>setPlatforms([])} style={{background:platforms.length?'#e5e7eb':'#3b82f6',color:platforms.length?'#111':'#fff'}}>전체</button> {P.map(v=><button key={v} onClick={()=>toggle(platforms,v,setPlatforms)} style={{background:platforms.includes(v)?'#3b82f6':'#e5e7eb',color:platforms.includes(v)?'#fff':'#111'}}>{v}</button>)}</div>
      <div>주문상태: {O.map(v=><button key={v} onClick={()=>toggle(orderStatuses,v,setOrderStatuses)} style={{background:orderStatuses.includes(v)?'#3b82f6':'#e5e7eb',color:orderStatuses.includes(v)?'#fff':'#111'}}>{v}</button>)}</div>
      <div>배송상태: {S.map(v=><button key={v} onClick={()=>toggle(shippingStatuses,v,setShippingStatuses)} style={{background:shippingStatuses.includes(v)?'#3b82f6':'#e5e7eb',color:shippingStatuses.includes(v)?'#fff':'#111'}}>{v}</button>)}</div>
      <div style={{display:'flex',gap:8}}><button onClick={exportExcel} disabled={!selected.length}>선택 엑셀 추출</button><button onClick={()=>bulk('checked')} disabled={!selected.length}>재고확인 처리</button><button onClick={()=>bulk('done')} disabled={!selected.length}>주문완료 처리</button><button onClick={()=>bulk('shipping_done')} disabled={!selected.length}>배송완료 처리</button></div>
    </div>
    <div className='table-wrap'><table><thead><tr><th>선택</th><th>플랫폼</th><th>고객주문번호</th><th>닉네임</th><th>상품요약</th><th>상품개수</th><th>수취인명</th><th>전화번호</th><th>주소</th><th>주문상태</th><th>운송장</th><th>생성일</th></tr></thead><tbody>
      {rows.map((r,i)=><tr key={r.order_id}><td><input type='checkbox' checked={r.selected} onChange={e=>setRows(prev=>prev.map((x,j)=>j===i?{...x,selected:e.target.checked}:x))}/></td><td>{r.platform}</td><td>{r.order_id}</td><td>{r.nickname}</td><td>{r.item_summary}</td><td>{r.item_count}</td><td>{r.recipient_name}</td><td>{r.phone}</td><td>{r.address}</td><td>{r.order_status}</td><td>{r.domestic_shipping?.tracking_number||''}</td><td>{r.created_at}</td></tr>)}
    </tbody></table></div>
  </div></main>;
}
